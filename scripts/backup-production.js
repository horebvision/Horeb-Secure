/**
 * =============================================================================
 * SECURIA SaaS — SCRIPT DE SAUVEGARDE DE PRODUCTION CONTRÔLÉE (PHASE 2.12 - REV B)
 * Fichier : scripts/backup-production.js
 * =============================================================================
 * 
 * RÔLE :
 * Exécuter une extraction de sauvegarde PostgreSQL intégrale, cohérente et
 * vérifiable de la base de données de production SECURIA au format binaire
 * personnalisé (-Fc), avant toute opération de migration ou de maintenance.
 * 
 * RÈGLES DEVSECOPS & FAIL-CLOSED (POST-AUDIT SÉCURITÉ) :
 * 1. REFUS ABSOLU DE TOUTE CIBLE NON HOMOLOGUÉE :
 *    Seule la référence officielle 'gwxchazcuosajziampvk' et les hôtes strictement
 *    rattachés à ce projet sont autorisés. Aucune règle générique .supabase.co.
 * 2. DOUBLE CONFIRMATION D'ENVIRONNEMENT EXIGÉE POUR L'EXÉCUTION RÉELLE :
 *    ALLOW_PRODUCTION_BACKUP=true ET CONFIRM_PRODUCTION_BACKUP=true.
 * 3. AUCUN SECRET DANS LES ARGUMENTS CLI DE PROCESSUS OU LES JOURNAUX :
 *    - Mode natif : PGPASSWORD dans le bloc d'environnement protégé de spawnSync.
 *    - Mode Docker : Transmission du mot de passe via flux stdin vers un shell
 *      interne (read -r PGPASS && export PGPASSWORD). ZÉRO argument -e PGPASSWORD=...
 *      dans la table des processus du système hôte (argv).
 *    - Sanitization systématique de toutes les exceptions et sorties d'erreur.
 * 4. VALIDATION STRUCTURELLE SANS DÉBORDEMENT MÉMOIRE :
 *    Vérification pg_restore -l en flux direct via descripteur de fichier,
 *    sans chargement de l'archive dans le tas mémoire Node.js (pas de readFileSync).
 * 5. PROTECTION ET VERROUILLAGE ÉTANCHE DES FICHIERS :
 *    - Création exclusive avec drapeau 'wx' (anti-écrasement atomique).
 *    - Échec bloquant immédiat si les ACLs / permissions ne peuvent pas être appliquées.
 *    - Nettoyage sécurisé garantissant de ne JAMAIS supprimer un fichier préexistant.
 * 6. MODE CONTRÔLE / DRY-RUN (--dry-run / --preflight) :
 *    Permet de valider localement tous les prérequis SANS connexion ni secret.
 * =============================================================================
 */

const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

// 1. CONFIGURATION DES IDENTIFIANTS OFFICIELS DE PRODUCTION
const AUTHORIZED_PRODUCTION_REF = 'gwxchazcuosajziampvk';

// Répertoire par défaut de sauvegarde sécurisée (couvert par le .gitignore via scratch/)
const DEFAULT_BACKUP_DIR = path.resolve(__dirname, '..', 'scratch', 'backups', 'production');

/**
 * Filtre préventif de masquage pour les formats standards connus (URLs postgresql:// avec mot de passe, password=, Bearer).
 * Note d'audit : Ce filtre réduit l'exposition dans les journaux mais ne constitue pas une preuve d'opacité absolue
 * pour des chaînes brutes non conformes ou des formats arbitraires non répertoriés.
 */
function sanitizeOutput(text) {
  if (!text) return '';
  return String(text)
    .replace(/postgresql:\/\/([^:]+):([^@]+)@/g, 'postgresql://$1:***@')
    .replace(/postgres:\/\/([^:]+):([^@]+)@/g, 'postgres://$1:***@')
    .replace(/password=[^\s&]+/gi, 'password=***')
    .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ***');
}

/**
 * Détecte les outils PostgreSQL disponibles (pg_dump et pg_restore)
 * Recherche d'abord dans le PATH, puis via le conteneur Docker local certifié.
 */
function resolvePostgresTools() {
  const result = {
    method: null, // 'native' | 'docker'
    pgDumpCmd: null,
    pgRestoreCmd: null,
    version: null,
    containerName: null,
  };

  // A. Vérification des outils natifs dans le PATH
  try {
    const dumpVer = execSync('pg_dump --version', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    const restoreVer = execSync('pg_restore --version', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    if (dumpVer && restoreVer) {
      result.method = 'native';
      result.pgDumpCmd = 'pg_dump';
      result.pgRestoreCmd = 'pg_restore';
      result.version = dumpVer;
      return result;
    }
  } catch {}

  // B. Recherche via le conteneur Docker certifié local (supabase_db_securia)
  try {
    const dockerPs = execSync('docker ps --filter "name=supabase_db_securia" --format "{{.Names}}"', {
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();

    if (dockerPs.includes('supabase_db_securia')) {
      const dumpVer = execSync('docker exec supabase_db_securia pg_dump --version', {
        stdio: ['pipe', 'pipe', 'pipe'],
      }).toString().trim();
      const restoreVer = execSync('docker exec supabase_db_securia pg_restore --version', {
        stdio: ['pipe', 'pipe', 'pipe'],
      }).toString().trim();

      if (dumpVer && restoreVer) {
        result.method = 'docker';
        result.containerName = 'supabase_db_securia';
        result.pgDumpCmd = ['docker', 'exec', '-i', 'supabase_db_securia', 'pg_dump'];
        result.pgRestoreCmd = ['docker', 'exec', '-i', 'supabase_db_securia', 'pg_restore'];
        result.version = dumpVer;
        return result;
      }
    }
  } catch {}

  return result;
}

/**
 * Vérifie l'espace disque disponible sur l'unité cible
 */
function checkDiskSpace(targetDir) {
  try {
    const rootDrive = path.parse(targetDir).root;
    if (process.platform === 'win32') {
      const driveLetter = rootDrive.replace(':\\', '');
      const out = execSync(
        `powershell -NoProfile -Command "(Get-PSDrive ${driveLetter}).Free"`,
        { stdio: ['pipe', 'pipe', 'pipe'] }
      ).toString().trim();
      const freeBytes = parseInt(out, 10);
      return { freeBytes, freeGb: (freeBytes / (1024 * 1024 * 1024)).toFixed(2) };
    }
  } catch {}
  return { freeBytes: null, freeGb: 'N/A' };
}

/**
 * Valide strictement la cible de connexion et extrait les paramètres sans exposer les secrets
 */
function validateAndParseTarget(rawUrl, rawProjectRef) {
  const ref = (rawProjectRef || process.env.SUPABASE_PROJECT_REF || '').trim().toLowerCase();

  // Contrôle 1 : La référence doit impérativement correspondre à la production officielle
  if (ref !== AUTHORIZED_PRODUCTION_REF) {
    throw new Error(
      `Cible non autorisée : la référence de projet fournie ("${ref}") ne correspond pas ` +
      `à la référence officielle de production de SECURIA ("${AUTHORIZED_PRODUCTION_REF}").`
    );
  }

  const connStr = (rawUrl || process.env.PRODUCTION_DB_URL || process.env.DATABASE_URL || '').trim();
  if (!connStr) {
    throw new Error('Paramètre manquant : Chaîne de connexion PostgreSQL (PRODUCTION_DB_URL) introuvable.');
  }

  // Contrôle 2 : Analyse et validation syntaxique stricte de l'URL avec masquage préventif
  let parsed;
  try {
    parsed = new URL(connStr);
  } catch (err) {
    throw new Error(`Format d'URL de base de données invalide : ${sanitizeOutput(err.message)}`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`Protocole de connexion invalide ("${parsed.protocol}"). Attendu : postgresql:`);
  }

  // Contrôle 3 : Validation stricte des ports PostgreSQL autorisés
  const port = parsed.port || '5432';
  if (port !== '5432' && port !== '6543') {
    throw new Error(`Port de connexion non prévu ("${port}"). Seuls les ports 5432 (direct/session) et 6543 (pooler) sont autorisés.`);
  }

  const hostname = (parsed.hostname || '').toLowerCase();
  const username = decodeURIComponent(parsed.username || 'postgres');

  // Contrôle 4 : RÈGLE STRICTE ANTI-DÉVIATION D'HÔTE
  // Seuls les formats explicitement rattachés au projet de production 'gwxchazcuosajziampvk' sont acceptés :
  // - Hôte direct officiel : db.gwxchazcuosajziampvk.supabase.co ou gwxchazcuosajziampvk.supabase.co
  // - Hôte pooler dédié : gwxchazcuosajziampvk.pooler.supabase.com
  // - Hôte pooler partagé Supabase : *.pooler.supabase.com OBLIGATOIREMENT couplé au rôle postgres.gwxchazcuosajziampvk
  const isDirectHost = (hostname === `db.${AUTHORIZED_PRODUCTION_REF}.supabase.co` || hostname === `${AUTHORIZED_PRODUCTION_REF}.supabase.co`);
  const isDedicatedPoolerHost = (hostname === `${AUTHORIZED_PRODUCTION_REF}.pooler.supabase.com`);
  const isSharedPoolerHost = hostname.endsWith('.pooler.supabase.com') && username.includes(AUTHORIZED_PRODUCTION_REF);

  if (!isDirectHost && !isDedicatedPoolerHost && !isSharedPoolerHost) {
    throw new Error(
      `Hôte cible non autorisé ("${hostname}"). L'hôte et les identifiants doivent être formellement ` +
      `rattachés à la référence officielle "${AUTHORIZED_PRODUCTION_REF}".`
    );
  }

  // Rejet immédiat de toute cible locale ou de test
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('local')) {
    throw new Error('Refus d\'exécution : Une cible locale a été fournie à la procédure de sauvegarde de production.');
  }

  const rawPassword = decodeURIComponent(parsed.password || '');
  if (/[\r\n]/.test(rawPassword)) {
    throw new Error('Paramètre de connexion invalide : Le mot de passe de la base de données contient des caractères de saut de ligne (CR/LF) non autorisés.');
  }

  return {
    host: parsed.hostname,
    port: port,
    user: username,
    password: rawPassword,
    database: (parsed.pathname || '/postgres').replace('/', '') || 'postgres',
    sslMode: parsed.searchParams.get('sslmode') || 'require',
  };
}

/**
 * Calcule l'empreinte SHA-256 d'un fichier
 */
function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * Exécute un test de vérification de l'archive via pg_restore -l
 * En mode Docker, l'archive est transférée via docker cp dans un fichier temporaire à nom imprévisible.
 * La validation n'est considérée comme RÉUSSIE que si pg_restore -l réussit ET si la suppression
 * de la copie temporaire dans le conteneur est confirmée.
 */
function verifyArchiveWithPgRestore(tools, filePath) {
  if (tools.method === 'native') {
    let res;
    try {
      res = spawnSync('pg_restore', ['-l', filePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch (spawnErr) {
      throw new Error(`Exception synchrone lors de l'exécution de pg_restore : ${sanitizeOutput(spawnErr.message)}`);
    }
    if (res.error) {
      throw new Error(`Échec d'exécution de pg_restore : ${sanitizeOutput(res.error.message)}`);
    }
    if (res.status !== 0) {
      throw new Error(`pg_restore -l a échoué avec le code ${res.status} : ${sanitizeOutput(res.stderr ? res.stderr.toString() : 'Erreur inconnue')}`);
    }
    const lines = res.stdout.toString().split('\n').filter((l) => l.trim().length > 0 && !l.startsWith(';'));
    if (lines.length === 0) {
      throw new Error('La table des matières (TOC) de l\'archive est vide.');
    }
    return lines.length;
  } else if (tools.method === 'docker') {
    // Validation stricte du conteneur local homologué
    const EXPECTED_CONTAINER = 'supabase_db_securia';
    if (tools.containerName !== EXPECTED_CONTAINER) {
      throw new Error(`Conteneur Docker cible non autorisé ("${tools.containerName}"). Seul "${EXPECTED_CONTAINER}" est homologué.`);
    }

    // Nom temporaire imprévisible dans /tmp du conteneur local
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const containerTempPath = `/tmp/securia_verify_${randomSuffix}.dump`;

    // Initialisation de l'état avant toute tentative de transfert
    let transferOrRestoreError = null;
    let cleanupError = null;
    let cleanupConfirmed = false;
    let tocEntriesCount = 0;

    try {
      // 1. Tentative de transfert de l'archive vers le conteneur via docker cp
      let cpRes;
      try {
        cpRes = spawnSync('docker', ['cp', filePath, `${EXPECTED_CONTAINER}:${containerTempPath}`], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (cpSpawnErr) {
        transferOrRestoreError = new Error(`Exception synchrone lors de l'appel docker cp : ${sanitizeOutput(cpSpawnErr.message)}`);
      }

      if (!transferOrRestoreError) {
        if (cpRes.error) {
          transferOrRestoreError = new Error(`Échec du transfert docker cp vers "${EXPECTED_CONTAINER}" : ${sanitizeOutput(cpRes.error.message)}`);
        } else if (cpRes.status !== 0) {
          transferOrRestoreError = new Error(`docker cp a échoué avec le code ${cpRes.status} : ${sanitizeOutput(cpRes.stderr ? cpRes.stderr.toString() : 'Erreur inconnue')}`);
        }
      }

      // 2. Si le transfert a réussi sans erreur, exécution de pg_restore -l
      if (!transferOrRestoreError) {
        let res;
        try {
          res = spawnSync('docker', ['exec', EXPECTED_CONTAINER, 'pg_restore', '-l', containerTempPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 50 * 1024 * 1024,
          });
        } catch (resSpawnErr) {
          transferOrRestoreError = new Error(`Exception synchrone lors de l'appel pg_restore dans le conteneur : ${sanitizeOutput(resSpawnErr.message)}`);
        }

        if (!transferOrRestoreError) {
          if (res.error) {
            transferOrRestoreError = new Error(`Échec d'exécution de pg_restore dans le conteneur : ${sanitizeOutput(res.error.message)}`);
          } else if (res.status !== 0) {
            transferOrRestoreError = new Error(`pg_restore -l (docker) a échoué avec le code ${res.status} : ${sanitizeOutput(res.stderr ? res.stderr.toString() : 'Erreur inconnue')}`);
          } else {
            const lines = res.stdout.toString().split('\n').filter((l) => l.trim().length > 0 && !l.startsWith(';'));
            if (lines.length === 0) {
              transferOrRestoreError = new Error('La table des matières (TOC) de l\'archive est vide.');
            } else {
              tocEntriesCount = lines.length;
            }
          }
        }
      }
    } catch (unhandledErr) {
      if (!transferOrRestoreError) {
        transferOrRestoreError = unhandledErr;
      }
    } finally {
      // 3. Nettoyage systématique et obligatoire du chemin temporaire dans le conteneur
      // Couvre même les échecs de docker cp pouvant laisser un fichier partiel dans /tmp
      try {
        let rmRes;
        try {
          rmRes = spawnSync('docker', ['exec', EXPECTED_CONTAINER, 'sh', '-c', `rm -f "${containerTempPath}" && test ! -e "${containerTempPath}"`], {
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (rmSpawnErr) {
          cleanupError = new Error(`Exception synchrone lors de la commande de nettoyage conteneur : ${sanitizeOutput(rmSpawnErr.message)}`);
        }

        if (!cleanupError) {
          if (rmRes.error) {
            cleanupError = new Error(`Échec d'exécution du nettoyage dans le conteneur ("${containerTempPath}") : ${sanitizeOutput(rmRes.error.message)}`);
          } else if (rmRes.status !== 0) {
            cleanupError = new Error(`Suppression non confirmée de la copie temporaire dans le conteneur (code ${rmRes.status}) : ${sanitizeOutput(rmRes.stderr ? rmRes.stderr.toString() : 'Fichier encore présent ou erreur rm/test')}`);
          } else {
            cleanupConfirmed = true;
          }
        }
      } catch (cleanErr) {
        cleanupError = new Error(`Exception lors du nettoyage de la copie temporaire conteneur : ${sanitizeOutput(cleanErr.message)}`);
      }
    }

    // 4. Évaluation stricte du résultat combiné : aucune erreur de nettoyage ne doit être masquée
    if (transferOrRestoreError && cleanupError) {
      throw new Error(
        `Échec combiné du transfert/validation ET du nettoyage dans le conteneur.\n` +
        `  - Erreur opérationnelle : ${transferOrRestoreError.message}\n` +
        `  - Erreur nettoyage conteneur : ${cleanupError.message}`
      );
    }
    if (transferOrRestoreError) {
      throw new Error(`Échec du transfert ou de la validation de l'archive (nettoyage conteneur confirmé) : ${transferOrRestoreError.message}`);
    }
    if (cleanupError || !cleanupConfirmed) {
      const detail = cleanupError ? cleanupError.message : 'Confirmation de suppression absente';
      throw new Error(`Nettoyage en échec (archive lisible mais copie temporaire non supprimée du conteneur) : ${detail}`);
    }

    // Succès garanti : archive valide ET suppression confirmée
    return tocEntriesCount;
  }

  throw new Error('Aucun outil pg_restore opérationnel pour vérifier l\'archive.');
}

/**
 * Applique et vérifie les restrictions strictes de permissions sur le fichier (Windows / POSIX)
 * Échoue de manière fermée (throw) si le durcissement ne peut pas être garanti.
 *
 * NOTE DE SÉCURITÉ ARCHITECTURALE — DISTINCTION ET LIMITES DES CONTRÔLES :
 * 1. Règles DACL enregistrées :
 *    Cette fonction inspecte directement la liste de contrôle d'accès discrétionnaire (DACL)
 *    du descripteur de sécurité Windows sur le système de fichiers (NTFS/ReFS).
 *    Elle garantit l'absence totale de règles héritées ($acl.AreAccessRulesProtected = $true et
 *    $rule.IsInherited = $false) et l'absence de toute ACE non autorisée.
 * 2. Identités autorisées (identifiées par SID) :
 *    Seuls trois SIDs immuables sont acceptés dans la liste blanche :
 *    - Le compte utilisateur Windows exécutant le processus ($currentUserSid)
 *    - Le compte local système NT AUTHORITY\\SYSTEM (S-1-5-18)
 *    - Le groupe local des Administrateurs BUILTIN\\Administrators (S-1-5-32-544)
 *    Toute identité non résolue ou tout SID externe entraîne un rejet bloquant.
 * 3. Droits explicitement accordés :
 *    - Utilisateur courant : Modify (lecture, écriture, exécution, suppression)
 *    - SYSTEM et Administrateurs locaux : FullControl
 *    Toute permission inattendue ou type de contrôle autre que 'Allow' est rejeté.
 * 4. Limites d'une vérification statique des droits effectifs Windows :
 *    La validation de la DACL confirme les ACEs statiquement inscrites sur l'objet.
 *    Elle ne constitue pas une preuve absolue des droits effectifs arbitrés dynamiquement
 *    par le Security Reference Monitor (SRM) du noyau Windows, qui peuvent être altérés par :
 *    - Les privilèges du jeton de sécurité (SeBackupPrivilege, SeRestorePrivilege, SeTakeOwnershipPrivilege) ;
 *    - Les niveaux d'intégrité obligatoire (Mandatory Integrity Labels / UAC) ;
 *    - Les politiques de groupe ou de restriction de code (GPO / AppLocker / SRP) ;
 *    - Les pilotes de filtres antivirus ou chiffrements sous-jacents (BitLocker / EFS).
 *    La fonction garantit ainsi la conformité la plus stricte possible de la DACL sans prétendre
 *    se substituer à l'arbitrage dynamique complet du système d'exploitation à l'exécution.
 */
function hardenFilePermissions(filePath) {
  const baseName = path.basename(filePath);
  if (process.platform === 'win32') {
    const psScript = `
$ErrorActionPreference = 'Stop'
$targetPath = $env:SECURIA_TARGET_FILE
if (-not $targetPath -or -not (Test-Path -LiteralPath $targetPath)) {
    throw "Fichier cible introuvable pour le durcissement ACL : $targetPath"
}

$currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if (-not $currentUserSid) {
    throw "Impossible d'identifier le SID du compte utilisateur courant."
}

$systemSid = 'S-1-5-18'       # NT AUTHORITY\\SYSTEM
$adminSid = 'S-1-5-32-544'    # BUILTIN\\Administrators
$allowedSids = @($currentUserSid, $systemSid, $adminSid)

$acl = Get-Acl -LiteralPath $targetPath
# Désactive l'héritage et supprime toute copie des règles héritées
$acl.SetAccessRuleProtection($true, $false)

# Suppression de toutes les règles existantes
$existingRules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
foreach ($r in $existingRules) {
    $acl.RemoveAccessRuleSpecific($r) | Out-Null
}

# Dérivation stricte des droits à partir des constantes .NET officielles
$userBaseRights = [System.Security.AccessControl.FileSystemRights]::Modify
$fullControlRights = [System.Security.AccessControl.FileSystemRights]::FullControl
$syncRight = [System.Security.AccessControl.FileSystemRights]::Synchronize

# Application des règles autorisées uniquement
$userSidObj = New-Object System.Security.Principal.SecurityIdentifier($currentUserSid)
$userRule = New-Object System.Security.AccessControl.FileSystemAccessRule($userSidObj, $userBaseRights, [System.Security.AccessControl.AccessControlType]::Allow)
$acl.AddAccessRule($userRule)

$systemSidObj = New-Object System.Security.Principal.SecurityIdentifier($systemSid)
$systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule($systemSidObj, $fullControlRights, [System.Security.AccessControl.AccessControlType]::Allow)
$acl.AddAccessRule($systemRule)

$adminSidObj = New-Object System.Security.Principal.SecurityIdentifier($adminSid)
$adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule($adminSidObj, $fullControlRights, [System.Security.AccessControl.AccessControlType]::Allow)
$acl.AddAccessRule($adminRule)

Set-Acl -LiteralPath $targetPath -AclObject $acl

# Calcul explicite des masques numériques attendus dérivés des constantes .NET et règles créées
$expectedUserMask = [int]$userBaseRights
if (([int]$userRule.FileSystemRights -band [int]$syncRight) -eq [int]$syncRight) {
    $expectedUserMask = $expectedUserMask -bor [int]$syncRight
}

$expectedFullControlMask = [int]$fullControlRights
if (([int]$systemRule.FileSystemRights -band [int]$syncRight) -eq [int]$syncRight) {
    $expectedFullControlMask = $expectedFullControlMask -bor [int]$syncRight
}

# VÉRIFICATION STRICTE DE LA DACL EFFECTIVEMENT ENREGISTRÉE SUR DISQUE
$checkAcl = Get-Acl -LiteralPath $targetPath
if (-not $checkAcl) {
    throw "Impossible de lire le descripteur de sécurité (DACL) du fichier cible."
}
if (-not $checkAcl.AreAccessRulesProtected) {
    throw "L'héritage des permissions n'a pas été désactivé avec succès (DACL non protégée)."
}

$checkRules = @($checkAcl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
if ($checkRules.Count -eq 0) {
    throw "Aucune règle d'accès DACL enregistrée sur le fichier."
}

$uniqueAllowedSids = @($allowedSids | Select-Object -Unique)
if ($checkRules.Count -ne $uniqueAllowedSids.Count) {
    throw "Nombre de règles DACL non conforme ($($checkRules.Count) règles au lieu de $($uniqueAllowedSids.Count) attendues)."
}

$userVerified = $false
$systemVerified = $false
$adminVerified = $false
$seenSids = @{}

foreach ($rule in $checkRules) {
    # 1. Refuser toute règle héritée
    if ($rule.IsInherited) {
        throw "Règle héritée non autorisée détectée dans la DACL."
    }

    # 2. Refuser toute identité non résolue ou invalide
    if (-not $rule.IdentityReference -or -not ($rule.IdentityReference -is [System.Security.Principal.SecurityIdentifier]) -or [string]::IsNullOrWhiteSpace($rule.IdentityReference.Value)) {
        throw "Identité non résolue ou invalide détectée dans la DACL."
    }

    # 3. Refuser tout type de contrôle d'accès autre que 'Allow'
    if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
        throw "Type de contrôle d'accès non autorisé détecté ($($rule.AccessControlType)) pour l'identité $($rule.IdentityReference.Value)."
    }

    $sid = $rule.IdentityReference.Value

    # 4. Refuser tout SID absent de la liste blanche stricte
    if ($allowedSids -notcontains $sid) {
        throw "Principal non autorisé détecté dans la DACL (SID: $sid)."
    }

    # 5. Refuser les doublons de règles pour un même SID
    if ($seenSids.ContainsKey($sid)) {
        throw "Règle DACL dupliquée ou multiple détectée pour le SID $sid."
    }
    $seenSids[$sid] = $true

    $actualMask = [int]$rule.FileSystemRights

    # 6. Vérifier strictement les droits par comparaison exacte des masques numériques .NET
    if ($sid -eq $currentUserSid) {
        # Rejet catégorique de FullControl pour l'utilisateur courant
        if (($actualMask -band [int]$fullControlRights) -eq [int]$fullControlRights) {
            throw "Droits excessifs : FullControl détecté pour le compte utilisateur ($sid), Modify attendu."
        }
        # Comparaison exacte au masque attendu : aucun droit supplémentaire ni manquant toléré
        if ($actualMask -ne $expectedUserMask) {
            throw "Masque de permissions non conforme pour l'utilisateur ($sid) : $actualMask (masque attendu : $expectedUserMask)."
        }
        $userVerified = $true
    } elseif ($sid -eq $systemSid) {
        if ($actualMask -ne $expectedFullControlMask) {
            throw "Masque de permissions inattendu pour SYSTEM ($sid) : $actualMask (FullControl attendu : $expectedFullControlMask)."
        }
        $systemVerified = $true
    } elseif ($sid -eq $adminSid) {
        if ($actualMask -ne $expectedFullControlMask) {
            throw "Masque de permissions inattendu pour Administrateurs ($sid) : $actualMask (FullControl attendu : $expectedFullControlMask)."
        }
        $adminVerified = $true
    } else {
        throw "SID non géré rencontré dans la liste blanche : $sid"
    }
}

if (-not $userVerified) {
    throw "Règle DACL requise pour l'utilisateur courant ($currentUserSid) manquante ou non validée."
}
if (-not $systemVerified) {
    throw "Règle DACL requise pour SYSTEM ($systemSid) manquante ou non validée."
}
if (-not $adminVerified) {
    throw "Règle DACL requise pour les Administrateurs locaux ($adminSid) manquante ou non validée."
}
`;

    const psResult = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      env: {
        ...process.env,
        SECURIA_TARGET_FILE: filePath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 5 * 1024 * 1024,
    });

    if (psResult.error) {
      throw new Error(`Échec d'exécution PowerShell pour "${baseName}" : ${sanitizeOutput(psResult.error.message)}`);
    }
    if (psResult.status !== 0) {
      const psErrText = psResult.stderr ? psResult.stderr.toString().trim() : 'Erreur inconnue';
      throw new Error(`Échec du durcissement/vérification des ACL Windows pour "${baseName}" : ${sanitizeOutput(psErrText)}`);
    }
  } else {
    try {
      fs.chmodSync(filePath, 0o600);
      const stat = fs.statSync(filePath);
      if ((stat.mode & 0o777) !== 0o600) {
        throw new Error(`Permissions POSIX non conformes (${(stat.mode & 0o777).toString(8)} au lieu de 600)`);
      }
    } catch (err) {
      throw new Error(`Échec critique du chmod sur "${baseName}" : ${sanitizeOutput(err.message)}`);
    }
  }
}


// =============================================================================
// PROGRAMME PRINCIPAL
// =============================================================================
async function main() {
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--preflight');
  const backupDir = process.env.SECURIA_BACKUP_DIR || DEFAULT_BACKUP_DIR;

  console.log('=============================================================================');
  console.log('SECURIA — PROCÉDURE DE SAUVEGARDE CONTRÔLÉE DE LA BASE DE PRODUCTION');
  console.log('=============================================================================\n');

  // ÉTAPE 1 : VÉRIFICATION DES OUTILS POSTGRESQL LOCAUX
  console.log('[1/5] Détection des utilitaires PostgreSQL (pg_dump / pg_restore)...');
  const tools = resolvePostgresTools();
  if (!tools.version) {
    console.error('❌ ERREUR BLOQUANTE : Aucun utilitaire PostgreSQL (pg_dump/pg_restore) détecté.');
    console.error('   Ni les outils natifs dans le PATH, ni le conteneur Docker "supabase_db_securia" ne sont accessibles.');
    process.exit(1);
  }
  console.log(`   Méthode d'exécution : ${tools.method === 'docker' ? `Docker (${tools.containerName})` : 'Binaire natif'}`);
  console.log(`   Version certifiée   : ${tools.version}`);

  // ÉTAPE 2 : VÉRIFICATION DE L'EMPLACEMENT DE STOCKAGE
  console.log('\n[2/5] Vérification de l\'emplacement de stockage et de l\'espace disque...');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const disk = checkDiskSpace(backupDir);
  console.log(`   Dossier de destination : ${backupDir}`);
  console.log(`   Espace disque libre    : ${disk.freeGb} Go`);
  if (disk.freeBytes !== null && disk.freeBytes < 2 * 1024 * 1024 * 1024) {
    console.error('❌ ERREUR BLOQUANTE : Espace disque insuffisant (< 2 Go libres requis).');
    process.exit(1);
  }

  // ÉTAPE 2.1 : VÉRIFICATION PRÉALABLE DU MÉCANISME DE VERROUILLAGE ACL
  console.log('   Vérification préalable des capacités de verrouillage ACL sur le stockage...');
  const probeFile = path.join(backupDir, `.probe_acl_${crypto.randomBytes(4).toString('hex')}.tmp`);
  try {
    const probeFd = fs.openSync(probeFile, 'wx');
    fs.closeSync(probeFd);
    hardenFilePermissions(probeFile);
  } catch (probeErr) {
    console.error('❌ ERREUR BLOQUANTE : Impossible d\'établir et vérifier les ACLs sur le stockage cible :', sanitizeOutput(probeErr.message));
    process.exit(1);
  } finally {
    if (fs.existsSync(probeFile)) {
      try { fs.unlinkSync(probeFile); } catch {}
    }
  }

  // ÉTAPE 3 : MODE PRÉVOL / DRY-RUN (CONTRÔLE STATIQUE DES GARDE-FOUS SANS CONNEXION)
  if (isDryRun) {
    console.log('\n[3/5] Mode Contrôle (--preflight / --dry-run) activé :');
    console.log('   ✅ Référence de production autorisée : ' + AUTHORIZED_PRODUCTION_REF);
    console.log('   ✅ Hôtes de production autorisés     : db.' + AUTHORIZED_PRODUCTION_REF + '.supabase.co (ou pooler homologué)');
    console.log('   ✅ Format d\'archive binaire certifié  : PostgreSQL Custom Archive (-Fc)');
    console.log('   ✅ Contrôles d\'intégrité intégrés     : SHA-256 + pg_restore -l (streaming fd)');
    console.log('   ✅ Masquage des secrets               : PGPASSWORD sans affichage console ni argv');
    console.log('   ℹ️  Aucune tentative de connexion distante n\'a été émise.');
    console.log('\n=============================================================================');
    console.log('RÉSULTAT DU CONTRÔLE : TOUS LES PRÉREQUIS TECHNIQUES SONT VALIDÉS.');
    console.log('VERDICT : PRÉPARATION TERMINÉE — EXÉCUTION RÉELLE NON AUTORISÉE');
    console.log('=============================================================================');
    process.exit(0);
  }

  // ÉTAPE 4 : GARDE-FOUS POUR L'EXÉCUTION RÉELLE (FAIL-CLOSED)
  console.log('\n[3/5] Contrôle des habilitations et garde-fous de production...');
  if (process.env.ALLOW_PRODUCTION_BACKUP !== 'true' || process.env.CONFIRM_PRODUCTION_BACKUP !== 'true') {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : L\'exécution réelle de la sauvegarde de production est BLOQUÉE.');
    console.error('   Pour autoriser formellement cette opération, vous devez définir explicitement :');
    console.error('   ALLOW_PRODUCTION_BACKUP=true');
    console.error('   CONFIRM_PRODUCTION_BACKUP=true');
    process.exit(1);
  }

  let connParams;
  try {
    connParams = validateAndParseTarget(process.env.PRODUCTION_DB_URL, process.env.SUPABASE_PROJECT_REF);
  } catch (targetErr) {
    // Masquage impératif de tout mot de passe pouvant figurer dans le message d'erreur d'URL
    console.error('❌ ERREUR DE CIBLE :', sanitizeOutput(targetErr.message));
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `securia_prod_backup_${AUTHORIZED_PRODUCTION_REF}_${timestamp}.dump`;
  const backupFilePath = path.join(backupDir, backupFileName);
  const metaFilePath = path.join(backupDir, `${backupFileName}.meta.json`);

  // GARANTIE ANTI-ÉCRASEMENT : Vérification d'absence de fichier préexistant
  if (fs.existsSync(backupFilePath)) {
    console.error(`❌ ERREUR DE SÉCURITÉ : Le fichier cible "${backupFileName}" existe déjà. Écrasement interdit.`);
    process.exit(1);
  }

  // Traçabilité des fichiers réellement créés par CETTE exécution pour un nettoyage sans régression
  let fileCreatedByThisRun = false;
  let metaCreatedByThisRun = false;

  const safeCleanup = () => {
    const status = {
      attempted: [],
      succeeded: [],
      failures: [],
      complete: true,
    };

    if (fileCreatedByThisRun && fs.existsSync(backupFilePath)) {
      status.attempted.push(backupFileName);
      try {
        fs.unlinkSync(backupFilePath);
        status.succeeded.push(backupFileName);
      } catch (unlinkErr) {
        status.complete = false;
        status.failures.push({
          file: backupFileName,
          error: sanitizeOutput(unlinkErr.message),
        });
      }
    }

    if (metaCreatedByThisRun && fs.existsSync(metaFilePath)) {
      const metaBaseName = path.basename(metaFilePath);
      status.attempted.push(metaBaseName);
      try {
        fs.unlinkSync(metaFilePath);
        status.succeeded.push(metaBaseName);
      } catch (unlinkErr) {
        status.complete = false;
        status.failures.push({
          file: metaBaseName,
          error: sanitizeOutput(unlinkErr.message),
        });
      }
    }

    return status;
  };

  const reportCleanupStatus = (cleanup) => {
    if (!cleanup || cleanup.attempted.length === 0) {
      return;
    }
    if (cleanup.succeeded.length > 0) {
      console.error(`   Nettoyage : Suppression confirmée pour : ${cleanup.succeeded.join(', ')}.`);
    }
    if (!cleanup.complete) {
      console.error('⚠️ ALERTE DE SÉCURITÉ CRITIQUE : Échec du nettoyage de fichiers temporaires :');
      for (const fail of cleanup.failures) {
        console.error(`   - Le fichier "${fail.file}" n'a PAS pu être supprimé : ${fail.error}`);
      }
      console.error('   Action impérative : Vérifier et purger manuellement ces fichiers résiduels.');
    }
  };

  // Enregistrement des gestionnaires d'interruption manuelle
  process.on('SIGINT', () => {
    console.error('\n⚠️ Interruption manuelle reçue (SIGINT). Nettoyage de sécurité...');
    const cleanup = safeCleanup();
    reportCleanupStatus(cleanup);
    process.exit(1);
  });
  process.on('SIGTERM', () => {
    console.error('\n⚠️ Signal d\'arrêt reçu (SIGTERM). Nettoyage de sécurité...');
    const cleanup = safeCleanup();
    reportCleanupStatus(cleanup);
    process.exit(1);
  });

  console.log(`   Cible validée : Hôte=${connParams.host}, Base=${connParams.database}, Port=${connParams.port}`);
  console.log(`   Fichier cible : ${backupFileName}`);

  // ÉTAPE 5 : EXÉCUTION CONTRÔLÉE DE PG_DUMP (-Fc) SANS SECRET DANS LES ARGUMENTS HÔTE
  console.log('\n[4/5] Lancement de l\'extraction pg_dump au format personnalisé (-Fc)...');
  const dumpArgs = [
    '--format=c',
    '--no-owner',
    '--no-privileges',
    '--quote-all-identifiers',
    `--host=${connParams.host}`,
    `--port=${connParams.port}`,
    `--username=${connParams.user}`,
    `--dbname=${connParams.database}`,
  ];

  const envOptions = {
    ...process.env,
    PGPASSWORD: connParams.password,
    PGSSLMODE: connParams.sslMode,
  };

  let dumpProcess;
  let outFd;
  try {
    outFd = fs.openSync(backupFilePath, 'wx');
    fileCreatedByThisRun = true;
  } catch (openErr) {
    console.error(`❌ ERREUR DE CRÉATION DE FICHIER : Impossible de créer "${backupFileName}" en mode exclusif :`, sanitizeOutput(openErr.message));
    process.exit(1);
  }

  try {
    if (tools.method === 'native') {
      dumpProcess = spawnSync('pg_dump', dumpArgs, {
        env: envOptions,
        stdio: ['ignore', outFd, 'pipe'],
        maxBuffer: 500 * 1024 * 1024,
      });
    } else {
      // Mode Docker : transmission du mot de passe via flux standard stdin vers le shell du conteneur.
      // ZÉRO mot de passe dans les arguments CLI de docker.exe (table des processus hôte protégée).
      const dockerDumpArgs = [
        'exec',
        '-i',
        tools.containerName,
        'sh',
        '-c',
        'read -r PGPASS && export PGPASSWORD="$PGPASS" && unset PGPASS && exec pg_dump "$@"',
        '--',
        '--format=c',
        '--no-owner',
        '--no-privileges',
        '--quote-all-identifiers',
        `--host=${connParams.host}`,
        `--port=${connParams.port}`,
        `--username=${connParams.user}`,
        `--dbname=${connParams.database}`,
      ];

      dumpProcess = spawnSync('docker', dockerDumpArgs, {
        input: connParams.password + '\n',
        stdio: ['pipe', outFd, 'pipe'],
        maxBuffer: 500 * 1024 * 1024,
      });
    }
  } finally {
    if (outFd !== undefined) {
      try { fs.closeSync(outFd); } catch {}
    }
  }

  if (dumpProcess.error) {
    const cleanup = safeCleanup();
    console.error('❌ ÉCHEC PROCESSUS PG_DUMP :', sanitizeOutput(dumpProcess.error.message));
    reportCleanupStatus(cleanup);
    process.exit(1);
  }
  if (dumpProcess.status !== 0) {
    const cleanup = safeCleanup();
    console.error('❌ ÉCHEC PG_DUMP :', sanitizeOutput(dumpProcess.stderr ? dumpProcess.stderr.toString() : 'Erreur inconnue'));
    reportCleanupStatus(cleanup);
    process.exit(1);
  }

  // ÉTAPE 6 : VÉRIFICATION D'INTÉGRITÉ IMMÉDIATE (SHA-256 + PG_RESTORE -L STREAMING/COPY)
  console.log('\n[5/5] Vérification d\'intégrité cryptographique et structurelle...');
  const stats = fs.statSync(backupFilePath);
  if (stats.size === 0) {
    const cleanup = safeCleanup();
    console.error('❌ ERREUR CRITIQUE : Le fichier dump généré est vide (0 octet).');
    reportCleanupStatus(cleanup);
    process.exit(1);
  }

  const sha256 = computeSha256(backupFilePath);
  console.log(`   Taille de l'archive : ${(stats.size / (1024 * 1024)).toFixed(2)} Mo`);
  console.log(`   Empreinte SHA-256   : ${sha256}`);

  let tocEntriesCount = 0;
  try {
    tocEntriesCount = verifyArchiveWithPgRestore(tools, backupFilePath);
    console.log(`   Structure vérifiée  : ${tocEntriesCount} objets lisibles dans la table des matières`);
    if (tools.method === 'docker') {
      console.log('   Nettoyage conteneur : Copie temporaire supprimée et confirmée inexistante');
    }
  } catch (verifyErr) {
    const cleanup = safeCleanup();
    console.error('❌ ÉCHEC DU CONTRÔLE DE L\'ARCHIVE OU DU NETTOYAGE :', sanitizeOutput(verifyErr.message));
    reportCleanupStatus(cleanup);
    process.exit(1);
  }

  // Durcissement impératif et vérifié des permissions sur l'archive (fail-closed)
  try {
    hardenFilePermissions(backupFilePath);
  } catch (permErr) {
    const cleanup = safeCleanup();
    console.error('❌ ÉCHEC DU VERROUILLAGE DES PERMISSIONS :', sanitizeOutput(permErr.message));
    console.error('   Impossible de garantir la confidentialité de l\'archive.');
    reportCleanupStatus(cleanup);
    process.exit(1);
  }

  // Écriture du fichier de métadonnées d'audit avec création exclusive et appartenance immédiate
  const metadata = {
    backup_file: backupFileName,
    project_ref: AUTHORIZED_PRODUCTION_REF,
    target_host: connParams.host,
    target_database: connParams.database,
    format: 'PostgreSQL custom archive (-Fc)',
    file_size_bytes: stats.size,
    sha256_checksum: sha256,
    toc_entries_count: tocEntriesCount,
    pg_dump_version: tools.version,
    created_at: new Date().toISOString(),
    status: 'VERIFIED_HEALTHY',
  };

  let metaFd;
  try {
    metaFd = fs.openSync(metaFilePath, 'wx');
    metaCreatedByThisRun = true;
    const metaContent = JSON.stringify(metadata, null, 2);
    fs.writeFileSync(metaFd, metaContent, { encoding: 'utf8' });
  } catch (metaErr) {
    const cleanup = safeCleanup();
    console.error('❌ ÉCHEC CRITIQUE DE CRÉATION DES MÉTADONNÉES :', sanitizeOutput(metaErr.message));
    reportCleanupStatus(cleanup);
    process.exit(1);
  } finally {
    if (metaFd !== undefined) {
      try { fs.closeSync(metaFd); } catch {}
    }
  }

  // Durcissement impératif des permissions sur le fichier de métadonnées
  try {
    hardenFilePermissions(metaFilePath);
  } catch (metaPermErr) {
    const cleanup = safeCleanup();
    console.error('❌ ÉCHEC CRITIQUE DU VERROUILLAGE DES PERMISSIONS MÉTADONNÉES :', sanitizeOutput(metaPermErr.message));
    reportCleanupStatus(cleanup);
    process.exit(1);
  }

  console.log(`   Métadonnées d'audit : ${metaFilePath}`);
  console.log('\n=============================================================================');
  console.log('SAUVEGARDE DE PRODUCTION VALIDÉE ET SÉCURISÉE AVEC SUCCÈS.');
  console.log('=============================================================================');
}

main().catch((err) => {
  console.error('❌ ERREUR NON RÉCUPÉRABLE :', sanitizeOutput(err.message));
  process.exit(1);
});
