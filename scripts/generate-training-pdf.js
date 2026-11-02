const { jsPDF } = require('jspdf');
const fs = require('fs');
const path = require('path');

function createTrainingPdf() {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const totalPages = 7;

  // Helper pour dessiner l'en-tête standard
  const drawHeader = (moduleTitle, category = 'MANUEL OFFICIEL DE FORMATION') => {
    // Bandeau supérieur sombre
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 24, 'F');

    // Badge Logo S
    doc.setFillColor(6, 182, 212); // cyan-500
    doc.roundedRect(margin, 5, 8, 8, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('S', margin + 2.7, 10.7);

    // Titre Securia
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('SECURIA', margin + 11, 11);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('Télésurveillance • Dispatching SOC • Intervention Mobile', margin + 11, 16.5);

    // Module / Chapitre à droite
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(56, 189, 248); // sky-400
    doc.text(category.toUpperCase(), pageWidth - margin - doc.getTextWidth(category.toUpperCase()), 10);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(255, 255, 255);
    doc.text(moduleTitle, pageWidth - margin - doc.getTextWidth(moduleTitle), 16);

    // Ligne cyan sous le bandeau
    doc.setDrawColor(6, 182, 212);
    doc.setLineWidth(0.6);
    doc.line(0, 24, pageWidth, 24);
  };

  // Helper pour dessiner le pied de page
  const drawFooter = (pageNum) => {
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('SECURIA v2.11.1 • Document de formation confidentiel et certifié • https://securia-pilot.netlify.app', margin, pageHeight - 7);

    const pageText = `Page ${pageNum} sur ${totalPages}`;
    doc.text(pageText, pageWidth - margin - doc.getTextWidth(pageText), pageHeight - 7);
  };

  // Helper pour encadré d'information
  const drawBox = (x, y, w, h, bgColor, borderColor, title, textColor = [15, 23, 42]) => {
    doc.setFillColor(...bgColor);
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');

    if (title) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...textColor);
      doc.text(title, x + 3.5, y + 5.5);
    }
  };

  // ==============================================================================
  // PAGE 1 : PAGE DE GARDE & SOMMAIRE EXÉCUTIF
  // ==============================================================================
  // Fond élégant haut
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 115, 'F');

  // Ligne de délimitation cyan
  doc.setDrawColor(6, 182, 212);
  doc.setLineWidth(1);
  doc.line(0, 115, pageWidth, 115);

  // Logo Badge central
  doc.setFillColor(6, 182, 212);
  doc.roundedRect(margin, 20, 14, 14, 3, 3, 'F');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('S', margin + 4.5, 29.5);

  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('SECURIA', margin + 18, 30);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(56, 189, 248);
  doc.text('PLATEFORME PROFESSIONNELLE DE SÉCURITÉ OPÉRATIONNELLE', margin, 44);

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('MANUEL COMPLET DE FORMATION', margin, 56);
  doc.text('& GUIDE D\'EXPLOITATION OPÉRATIONNELLE', margin, 64);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  const introText = 'Ce document officiel détaille l\'ensemble des processus, rôles et parcours de travail de la plateforme SECURIA : administration centrale multi-entreprises, centre de dispatching et télésurveillance (SOC), intervention mobile des patrouilleurs de terrain et espace des abonnés.';
  const introLines = doc.splitTextToSize(introText, contentWidth);
  doc.text(introLines, margin, 74);

  // Cartouche Métadonnées
  doc.setFillColor(30, 41, 59); // slate-800
  doc.roundedRect(margin, 92, contentWidth, 16, 2, 2, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(56, 189, 248);
  doc.text('VERSION DE PRODUCTION : v2.11.1', margin + 4, 98);
  doc.text('ENVIRONNEMENT LIVE : securia-pilot.netlify.app', margin + 4, 104);
  doc.setTextColor(148, 163, 184);
  doc.text('DATE D\'ÉDITION : 2026', pageWidth - margin - 45, 98);
  doc.text('PUBLIC : Administrateurs, SOC, Patrouilleurs', pageWidth - margin - 65, 104);

  // SOMMAIRE GÉNÉRAL
  let curY = 125;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('SOMMAIRE DU PROGRAMME DE FORMATION', margin, curY);

  curY += 7;
  const modules = [
    { num: 'MODULE 1', title: 'Architecture Multi-Tenant & Rôles Applicatifs', page: 'Page 2', desc: 'Comprendre l\'isolation des sociétés, les 4 niveaux d\'accès et la sécurité des données.' },
    { num: 'MODULE 2', title: 'Espace Super-Administrateur (Gestion Plateforme)', page: 'Page 3', desc: 'Création des sociétés clientes, transmission des accès gérant, abonnements et facturation.' },
    { num: 'MODULE 3', title: 'Espace Direction & SOC de la Société de Sécurité', page: 'Page 4', desc: 'Gestion des patrouilleurs, transmission des accès WhatsApp/SMS, gestion des clients et sites.' },
    { num: 'MODULE 4', title: 'Poste de Régulation SOC & Traitement d\'Alarme', page: 'Page 5', desc: 'Radar cartographique en direct, levée de doute, smart-dispatching et affectation d\'urgence.' },
    { num: 'MODULE 5', title: 'Guide Opérationnel du Patrouilleur Terrain', page: 'Page 6', desc: 'Connexion mobile, statut Disponible, GPS, acceptation, photos preuves et signature client.' },
    { num: 'MODULE 6', title: 'Portail Client Final & Procédures d\'Urgence (FAQ)', page: 'Page 7', desc: 'Consultation des interventions certifiées, gestion des accès et résolutions des incidents.' },
  ];

  modules.forEach((m, idx) => {
    drawBox(margin, curY, contentWidth, 20, [248, 250, 252], [226, 232, 240]);

    // Badge module
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin + 3, curY + 3.5, 22, 6, 1.5, 1.5, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(56, 189, 248);
    doc.text(m.num, margin + 5, curY + 7.5);

    // Titre
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(m.title, margin + 28, curY + 8);

    // Numéro de page
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 182, 212);
    doc.text(m.page, pageWidth - margin - 18, curY + 8);

    // Description
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(m.desc, margin + 5, curY + 15);

    curY += 23;
  });

  drawFooter(1);

  // ==============================================================================
  // PAGE 2 : MODULE 1 — ARCHITECTURE MULTI-TENANT & RÔLES
  // ==============================================================================
  doc.addPage();
  drawHeader('Module 1 : Architecture & Rôles');

  curY = 32;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('1. ARCHITECTURE MULTI-TENANT & ISOLATION STRICTE', margin, curY);

  curY += 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const m1Desc = 'SECURIA est une plateforme mutualisée à haute disponibilité intégrant un cloisonnement multi-tenant hermétique. Chaque société de sécurité cliente opère dans son propre écosystème totalement étanche : aucune entreprise ne peut visualiser les patrouilleurs, clients, alarmes ou sites d\'une société concurrente.';
  doc.text(doc.splitTextToSize(m1Desc, contentWidth), margin, curY);

  curY += 16;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('2. LES 4 RÔLES APPLICATIFS ET LEURS HABILITATIONS', margin, curY);

  curY += 6;
  const roles = [
    {
      role: 'SUPER_ADMIN (Plateforme)',
      who: 'Équipe de direction Securia Technologies',
      rights: 'Supervision globale de l\'infrastructure, création des sociétés clientes de sécurité, configuration des plans de facturation, accès au journal d\'audit complet et intervention technique en assistance.',
      url: '/admin et sous-rubriques (/admin/organizations, /admin/billing)',
      color: [147, 51, 234], // purple-600
    },
    {
      role: 'SECURITY_MANAGER (Direction & SOC)',
      who: 'Directeur, Responsable Opérationnel, Régulateur SOC',
      rights: 'Administration complète de la société de sécurité : création et supervision de la flotte d\'agents, envoi des accès, gestion des clients et sites abonnés, traitement des alertes sur le radar cartographique en direct.',
      url: '/dispatch, /dispatch/map, /dispatch/agents, /dispatch/clients',
      color: [6, 182, 212], // cyan-500
    },
    {
      role: 'AGENT (Patrouilleur de Terrain)',
      who: 'Agent de sécurité mobile, motard ou équipage véhiculé',
      rights: 'Interface dédiée 100% tactile sur smartphone : déclaration de statut de garde (Disponible, Occupé), partage GPS temps réel, réception des missions d\'urgence, saisie des rapports et signature client.',
      url: '/agent (Poste Mobile Terrain)',
      color: [16, 185, 129], // emerald-500
    },
    {
      role: 'USER (Client / Abonné Protégé)',
      who: 'Propriétaire de villa, gérant de commerce, directeur de site',
      rights: 'Déclenchement d\'alarme SOS / panique, consultation de ses sites protégés, suivi en direct de l\'intervention assignée et téléchargement des certificats officiels d\'intervention horodatés.',
      url: '/client-portal (Portail Client Sécurisé)',
      color: [59, 130, 246], // blue-500
    },
  ];

  roles.forEach((r) => {
    drawBox(margin, curY, contentWidth, 31, [248, 250, 252], [226, 232, 240]);

    doc.setFillColor(...r.color);
    doc.roundedRect(margin + 3, curY + 3.5, 4, 24, 1, 1, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(r.role, margin + 10, curY + 7);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text(`Utilisateurs : ${r.who}`, margin + 10, curY + 12);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const rightsLines = doc.splitTextToSize(`Habilitations : ${r.rights}`, contentWidth - 14);
    doc.text(rightsLines, margin + 10, curY + 17);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 182, 212);
    doc.text(`Espace dédié : ${r.url}`, margin + 10, curY + 28);

    curY += 34;
  });

  // Encadré de synthèse
  curY += 2;
  drawBox(margin, curY, contentWidth, 24, [240, 253, 250], [153, 246, 228], 'REGLE D\'OR SECURITÉ & ROUTAGE AUTOMATIQUE', [15, 118, 110]);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(19, 78, 74);
  const ruleTxt = 'Tous les utilisateurs se connectent via la même URL d\'entrée : https://securia-pilot.netlify.app/login. Dès authentification, le système analyse le rôle de l\'utilisateur et le redirige automatiquement vers son poste de travail exclusif sans aucun risque de confusion.';
  doc.text(doc.splitTextToSize(ruleTxt, contentWidth - 8), margin + 4, curY + 11);

  drawFooter(2);

  // ==============================================================================
  // PAGE 3 : MODULE 2 — ESPACE SUPER-ADMINISTRATEUR
  // ==============================================================================
  doc.addPage();
  drawHeader('Module 2 : Espace Super-Administrateur');

  curY = 32;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('CRÉATION & GESTION DES SOCIÉTÉS DE SÉCURITÉ CLIENTES', margin, curY);

  curY += 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const m2Intro = 'Le Super-Administrateur est garant du déploiement des sociétés clientes sur la plateforme. Il gère l\'onboarding, la configuration commerciale et l\'assistance aux gérants de sociétés de sécurité.';
  doc.text(doc.splitTextToSize(m2Intro, contentWidth), margin, curY);

  curY += 14;
  const adminSteps = [
    {
      step: 'ÉTAPE 1 : Accès à la Gestion des Entreprises (/admin/organizations)',
      details: 'Connectez-vous avec votre compte Super-Admin. Dans le menu de gauche, sélectionnez "Gestion Entreprises". Vous accédez à la liste complète des sociétés clientes avec leur statut (Actif, Suspendu, Essai), leur flotte d\'agents et leur volume de sites abonnés.',
    },
    {
      step: 'ÉTAPE 2 : Création d\'une Nouvelle Entreprise de Sécurité',
      details: 'Cliquez sur le bouton bleu "+ Nouvelle Entreprise". Renseignez le nom commercial (ex: Horeb Vision Sécurité), l\'adresse de son siège, l\'indicatif téléphonique, l\'email officiel du gérant et la formule d\'abonnement choisie (Starter, Professionnel, Entreprise).',
    },
    {
      step: 'ÉTAPE 3 : Génération Automatique des Identifiants du Gérant',
      details: 'La plateforme crée instantanément : (1) L\'espace de l\'organisation étanche, (2) Le compte administrateur du gérant dans Supabase Auth, (3) Un mot de passe initial sécurisé. Une carte d\'identifiants apparaît avec le lien de connexion et les codes d\'accès à transmettre au client.',
    },
    {
      step: 'ÉTAPE 4 : Switcher Multi-Tenant & Assistance Technique',
      details: 'En tant que Super-Administrateur, vous pouvez à tout moment assister une société cliente sans demander son mot de passe : le sélecteur d\'organisation situé dans la barre supérieure vous permet de basculer instantanément dans l\'espace de l\'entreprise pour vérification opérationnelle.',
    },
    {
      step: 'ÉTAPE 5 : Facturation & Pilotage Financier (/admin/billing)',
      details: 'Suivez le chiffre d\'affaires mensuel récurrent (MRR), l\'émission des factures proforma et attestations fiscales, la relance des impayés et la suspension en 1 clic d\'une entreprise en cas de résiliation.',
    },
  ];

  adminSteps.forEach((s) => {
    drawBox(margin, curY, contentWidth, 27, [248, 250, 252], [226, 232, 240]);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(147, 51, 234);
    doc.text(s.step, margin + 4, curY + 6);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const dLines = doc.splitTextToSize(s.details, contentWidth - 8);
    doc.text(dLines, margin + 4, curY + 12);

    curY += 30;
  });

  // Tableau récapitulatif des formules
  curY += 2;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('GRILLE TARIFAIRE DES SOCIÉTÉS DE SÉCURITÉ', margin, curY);

  curY += 5;
  drawBox(margin, curY, contentWidth, 38, [255, 255, 255], [203, 213, 225]);

  // Headers tableau
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, curY, contentWidth, 8, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('PLAN', margin + 3, curY + 5.5);
  doc.text('TARIF MENSUEL', margin + 35, curY + 5.5);
  doc.text('AGENTS INCLUS', margin + 75, curY + 5.5);
  doc.text('SITES SURVEILLÉS', margin + 115, curY + 5.5);
  doc.text('FONCTIONNALITÉS CLÉS', margin + 150, curY + 5.5);

  const planRows = [
    { p: 'Starter', t: '75 000 FCFA', a: 'Jusqu\'à 5 agents', s: '50 sites', f: 'Radar GPS + Rapports PDF' },
    { p: 'Professionnel', t: '150 000 FCFA', a: 'Jusqu\'à 20 agents', s: '250 sites', f: 'Smart-Dispatch + Portail Client' },
    { p: 'Entreprise', t: '300 000 FCFA', a: 'Agents illimités', s: 'Sites illimités', f: 'API Télésurveillance + Levée Vidéo' },
  ];

  let tableY = curY + 13;
  planRows.forEach((r) => {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(r.p, margin + 3, tableY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(r.t, margin + 35, tableY);
    doc.text(r.a, margin + 75, tableY);
    doc.text(r.s, margin + 115, tableY);
    doc.text(r.f, margin + 150, tableY);

    tableY += 9;
  });

  drawFooter(3);

  // ==============================================================================
  // PAGE 4 : MODULE 3 — ESPACE DIRECTION & SOC ENTREPRISE
  // ==============================================================================
  doc.addPage();
  drawHeader('Module 3 : Espace Entreprise & Flotte');

  curY = 32;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('GESTION DE LA FLOTTE, DES CLIENTS ET DES COLLABORATEURS', margin, curY);

  curY += 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const m3Intro = 'Ce module forme les gérants et chefs de centre SOC à administrer leur flotte d\'intervention et à enregistrer les clients abonnés rattachés à leur entreprise de sécurité.';
  doc.text(doc.splitTextToSize(m3Intro, contentWidth), margin, curY);

  curY += 13;
  // Section A : Gestion des agents
  drawBox(margin, curY, contentWidth, 54, [248, 250, 252], [226, 232, 240], 'A. CRÉATION & TRANSMISSION DES ACCÈS AUX AGENTS (/dispatch/agents)', [6, 182, 212]);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const agSteps = [
    '1. Cliquez sur "+ Nouvel Agent" dans la page Gestion des Patrouilles.',
    '2. Renseignez : Nom complet, Email de connexion, Téléphone, Numéro de matricule (badge) et Véhicule affecté.',
    '3. Définissez le mot de passe initial ou laissez vide (le mot de passe par défaut Securia@2026 sera attribué).',
    '4. Cliquez sur "Créer & Intégrer à la Flotte" : la fiche d\'accès instantanée s\'affiche à l\'écran.',
    '5. Cliquez sur le bouton "📋 Copier le message complet (WhatsApp / SMS)" pour envoyer immédiatement les accès à l\'agent.',
    '6. Retrait d\'un agent : en cas de départ ou d\'erreur, cliquez sur la Corbeille rouge sur la carte de l\'agent pour le supprimer définitivement.',
  ];
  let aY = curY + 11;
  agSteps.forEach((st) => {
    doc.text(st, margin + 4, aY);
    aY += 6.8;
  });

  curY += 58;
  // Section B : Gestion des clients
  drawBox(margin, curY, contentWidth, 54, [248, 250, 252], [226, 232, 240], 'B. CRÉATION DES CLIENTS ABONNÉS & SITES PROTÉGÉS (/dispatch/clients)', [16, 185, 129]);
  const clSteps = [
    '1. Cliquez sur "+ Nouveau Client" pour créer le dossier de l\'abonné particulier ou entreprise.',
    '2. Renseignez : Raison sociale ou nom du client, contact direct, adresse email et numéro d\'urgence 24/7.',
    '3. Rattachez les sites protégés : nom de la villa/bâtiment, coordonnées GPS (ou adresse géographique) et consignes d\'accès.',
    '4. Transmission des accès : générez un lien d\'invitation ou un compte direct permettant au client d\'accéder à son portail.',
    '5. Les sites créés apparaissent immédiatement sur le radar cartographique SOC (/dispatch/map) avec leurs périmètres.',
    '6. Archivage / Suppression : vous pouvez à tout moment suspendre ou supprimer un compte client devenu inactif.',
  ];
  let cY = curY + 11;
  clSteps.forEach((st) => {
    doc.text(st, margin + 4, cY);
    cY += 6.8;
  });

  curY += 58;
  // Section C : Gestion des collaborateurs internes
  drawBox(margin, curY, contentWidth, 54, [248, 250, 252], [226, 232, 240], 'C. GESTION DES COLLABORATEURS INTERNES SOC (/settings/users)', [59, 130, 246]);
  const usrSteps = [
    '1. Rendez-vous dans "Mon Entreprise > Utilisateurs & Collaborateurs".',
    '2. Cliquez sur "Inviter un collaborateur" pour ajouter un opérateur SOC, régulateur ou chef de patrouille.',
    '3. Définissez son rôle : SECURITY_MANAGER (accès complet dispatch + administration) ou OPERATOR (salle de contrôle).',
    '4. Changement de statut : suspendez temporairement l\'accès d\'un opérateur en congé en 1 clic (Bouton Pause/Play).',
    '5. Suppression définitive : cliquez sur l\'icône Corbeille rouge pour révoquer et purger définitivement le profil.',
    '6. Isolation stricte : un collaborateur de votre entreprise n\'a jamais accès aux données d\'autres sociétés.',
  ];
  let uY = curY + 11;
  usrSteps.forEach((st) => {
    doc.text(st, margin + 4, uY);
    uY += 6.8;
  });

  drawFooter(4);

  // ==============================================================================
  // PAGE 5 : MODULE 4 — LE POSTE DE RÉGULATION SOC & ALARMES
  // ==============================================================================
  doc.addPage();
  drawHeader('Module 4 : Traitement Opérationnel SOC');

  curY = 32;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('LE RADAR CARTOGRAPHIQUE & LE TRAITEMENT DES ALARMES', margin, curY);

  curY += 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const m4Intro = 'Le Centre Opérationnel de Sécurité (SOC) est le cœur nerveux de la réactivité. Ce module décrit comment le régulateur qualifie, suit et dispatche les alarmes d\'urgence avec l\'aide de l\'algorithme de dispatching intelligent.';
  doc.text(doc.splitTextToSize(m4Intro, contentWidth), margin, curY);

  curY += 14;
  // Les 4 phases de l'intervention
  const phases = [
    {
      p: 'PHASE 1 : DÉCLENCHEMENT & RÉCEPTION DE L\'ALERTE (< 10 SECONDES)',
      items: [
        '• Provenance : bouton panique client, détection intrusion périmétrique, capteur connecté ou appel SOC.',
        '• Signal sonore d\'urgence : la salle de contrôle est alertée instantanément par un carillon sonore haute priorité.',
        '• Clignotement rouge sur le radar (/dispatch/map) avec positionnement exact du site attaqué.',
      ],
    },
    {
      p: 'PHASE 2 : QUALIFICATION & LEVÉE DE DOUTE OPÉRATIONNELLE (< 30 SECONDES)',
      items: [
        '• Le régulateur clique sur l\'alerte : fiche du site, téléphone du propriétaire et consignes d\'accès s\'affichent.',
        '• Levée de doute vidéo : consultation des flux caméras en direct ou snapshot horodaté si le site est équipé.',
        '• Requalification : confirmation d\'intrusion critique ou clôture en fausse alerte si déclenchement involontaire.',
      ],
    },
    {
      p: 'PHASE 3 : RECOMMANDATION SMART-DISPATCHING & AFFECTATION (< 1 MINUTE)',
      items: [
        '• L\'algorithme calcule en temps réel : distance GPS de chaque patrouilleur, statut (Disponible), temps estimé (ETA).',
        '• Affichage automatique du patrouilleur optimal en tête de liste avec son temps d\'arrivée prévisionnel.',
        '• Clic sur "Affecter la mission" : transmission immédiate de l\'ordre de mission sur le smartphone du patrouilleur.',
      ],
    },
    {
      p: 'PHASE 4 : SUPERVISION DE LA PROGRESSION EN TEMPS RÉEL',
      items: [
        '• Suivi du trajet : le régulateur voit le patrouilleur passer au statut "En route", puis "Arrivé sur site".',
        '• Sécurisation : l\'agent sécurise les lieux, prend des photos de preuve horodatées et fait signer le rapport au client.',
        '• Clôture : génération automatique du document certifié "Proof of Intervention" avec horodatage infalsifiable.',
      ],
    },
  ];

  phases.forEach((ph) => {
    drawBox(margin, curY, contentWidth, 36, [248, 250, 252], [226, 232, 240]);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(225, 29, 72); // rose-600
    doc.text(ph.p, margin + 4, curY + 6);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    let itemY = curY + 12;
    ph.items.forEach((it) => {
      doc.text(it, margin + 6, itemY);
      itemY += 6.5;
    });

    curY += 39;
  });

  // Checklist de performance SLA
  curY += 2;
  drawBox(margin, curY, contentWidth, 25, [254, 243, 199], [252, 211, 77], 'OBJECTIFS DE PERFORMANCE ET ENGAGEMENT SLA SECURIA', [180, 83, 9]);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(146, 64, 14);
  doc.text('• Accusé de réception alerte par le SOC : < 60 secondes (Critique) / < 120 secondes (Standard)', margin + 4, curY + 11);
  doc.text('• Départ de la patrouille d\'intervention : < 2 minutes après qualification', margin + 4, curY + 16);
  doc.text('• Arrivée sur site en agglomération : Objectif moyen < 8 à 12 minutes', margin + 4, curY + 21);

  drawFooter(5);

  // ==============================================================================
  // PAGE 6 : MODULE 5 — GUIDE DU PATROUILLEUR TERRAIN
  // ==============================================================================
  doc.addPage();
  drawHeader('Module 5 : Guide Patrouilleur Mobile');

  curY = 32;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('LE POSTE MOBILE TERRAIN : PRISE DE SERVICE & INTERVENTION', margin, curY);

  curY += 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const m5Intro = 'L\'interface Agent de SECURIA est spécialement conçue pour les smartphones tactiles (Android et iOS). Elle permet au patrouilleur de gérer ses vacations, de recevoir les missions et d\'établir les preuves d\'intervention sur site.';
  doc.text(doc.splitTextToSize(m5Intro, contentWidth), margin, curY);

  curY += 13;
  const agentWorkflow = [
    {
      num: '1',
      title: 'CONNEXION INITIALE SUR SMARTPHONE',
      desc: 'Ouvrez https://securia-pilot.netlify.app/login sur votre navigateur mobile. Saisissez votre adresse email et le mot de passe reçu par WhatsApp / SMS. La plateforme vous dirige immédiatement vers votre Poste Mobile Terrain (/agent).',
    },
    {
      num: '2',
      title: 'PRISE DE VACATION : STATUT "DISPONIBLE"',
      desc: 'En début de garde, cliquez sur le bouton vert "🟢 Disponible". Dès cet instant, votre position GPS est partagée en temps réel avec le centre de régulation SOC et vous devenez éligible pour recevoir des missions d\'intervention.',
    },
    {
      num: '3',
      title: 'RÉCEPTION D\'UNE MISSION D\'INTERVENTION',
      desc: 'Lorsqu\'une alarme vous est assignée, votre smartphone émet un signal sonore strident et une alerte rouge s\'affiche avec l\'adresse, le type d\'urgence et le plan d\'accès. Cliquez sur "Accepter la mission".',
    },
    {
      num: '4',
      title: 'DÉCLARATION "EN ROUTE" & NAVIGATION GPS',
      desc: 'Dès que vous montez sur votre moto ou véhicule, cliquez sur "En route". Le bouton GPS lance l\'itinéraire direct vers le site. Votre progression est suivie en direct par le régulateur et par l\'abonné.',
    },
    {
      num: '5',
      title: 'ARRIVÉE SUR SITE & RONDE DE SÉCURITÉ',
      desc: 'Dès votre arrivée sur les lieux, cliquez sur "Arrivé sur site". Effectuez la vérification du périmètre, le contrôle des ouvrants et la neutralisation de toute menace selon les consignes de sécurité.',
    },
    {
      num: '6',
      title: 'PHOTOS PREUVES & SIGNATURE CLIENT',
      desc: 'Prenez 1 à 3 photos des lieux directement avec l\'appareil photo du smartphone. Rédigez un court compte-rendu (ex: Poignée contrôlée, fausse alerte vent). Faites signer le client avec son doigt sur votre écran tactile.',
    },
    {
      num: '7',
      title: 'CLÔTURE & REPRISE DE GARDE',
      desc: 'Cliquez sur "Valider & Clôturer l\'intervention". Le certificat PDF certifié est généré. Repassez votre statut en "🟢 Disponible" pour la prochaine mission ou "⚪ Hors service" en fin de vacation.',
    },
  ];

  agentWorkflow.forEach((aw) => {
    drawBox(margin, curY, contentWidth, 23.5, [248, 250, 252], [226, 232, 240]);

    // Cercle numéro
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(margin + 3, curY + 4, 6, 6, 1.5, 1.5, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(aw.num, margin + 4.8, curY + 8.3);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(aw.title, margin + 12, curY + 8);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const dLines = doc.splitTextToSize(aw.desc, contentWidth - 16);
    doc.text(dLines, margin + 12, curY + 13.5);

    curY += 26.5;
  });

  drawFooter(6);

  // ==============================================================================
  // PAGE 7 : MODULE 6 — PORTAIL CLIENT & PROCÉDURES D'URGENCE (FAQ)
  // ==============================================================================
  doc.addPage();
  drawHeader('Module 6 : Client Final & Support FAQ');

  curY = 32;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('ESPACE CLIENT PROTÉGÉ & RÉSOLUTION DES INCIDENTS (FAQ)', margin, curY);

  curY += 6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const m6Intro = 'L\'abonné protégé bénéficie d\'une transparence totale sur la sécurité de son site. Ce module présente son espace personnel et fournit les réponses aux questions techniques fréquentes.';
  doc.text(doc.splitTextToSize(m6Intro, contentWidth), margin, curY);

  curY += 13;
  // Section Portail Client
  drawBox(margin, curY, contentWidth, 38, [248, 250, 252], [226, 232, 240], 'LE PORTAIL CLIENT FINAL (/client-portal)', [59, 130, 246]);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const cpLines = [
    '• Déclencheur SOS d\'urgence : l\'abonné peut déclencher une alerte discrète ou générale en un clic sur son smartphone.',
    '• Suivi de mission en temps réel : visualisation de la patrouille en route avec heure d\'arrivée estimée (ETA).',
    '• Historique des interventions : liste exhaustive de toutes les alarmes passées avec nom des agents intervenus.',
    '• Téléchargement des certificats PDF : accès aux rapports certifiés comprenant photos, horodatages et signature numérique.',
  ];
  let cpY = curY + 11;
  cpLines.forEach((l) => {
    doc.text(l, margin + 4, cpY);
    cpY += 6.5;
  });

  curY += 42;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('FOIRE AUX QUESTIONS & BONNES PRATIQUES OPÉRATIONNELLES', margin, curY);

  curY += 6;
  const faqs = [
    {
      q: 'Q1 : Que faire si un agent oublie son mot de passe ou n\'arrive pas à se connecter ?',
      a: 'Le gestionnaire d\'entreprise se rend dans "/dispatch/agents" ou "/settings/users", clique sur le collaborateur et peut lui réattribuer un nouveau mot de passe ou lui renvoyer ses accès WhatsApp en 1 clic.',
    },
    {
      q: 'Q2 : Pourquoi un patrouilleur n\'apparaît-il pas sur le radar cartographique ?',
      a: 'Vérifiez deux points : (1) L\'agent doit être connecté et avoir cliqué sur "🟢 Disponible", (2) L\'agent doit avoir autorisé le navigateur de son smartphone à accéder à la géolocalisation GPS.',
    },
    {
      q: 'Q3 : Comment gérer une alarme déclenchée accidentellement par un enfant ou gardien ?',
      a: 'Le régulateur SOC contacte le client par téléphone. Si la levée de doute est confirmée négative, le régulateur clôture l\'alerte sous le motif "FALSE_ALARM" (Fausse alerte) pour ne pas déplacer inutilement une patrouille.',
    },
    {
      q: 'Q4 : Les données d\'une société de sécurité peuvent-elles fuiter vers une autre société ?',
      a: 'Non. Le système applique des stratégies de sécurité Supabase RLS (Row Level Security) et des filtres serveur garantissant qu\'aucune requête ne peut franchir la frontière d\'un identifiant d\'organisation.',
    },
  ];

  faqs.forEach((f) => {
    drawBox(margin, curY, contentWidth, 27, [248, 250, 252], [226, 232, 240]);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(f.q, margin + 4, curY + 6);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const aLines = doc.splitTextToSize(f.a, contentWidth - 8);
    doc.text(aLines, margin + 4, curY + 12);

    curY += 30;
  });

  // Bloc contacts et assistance
  curY += 1;
  drawBox(margin, curY, contentWidth, 24, [15, 23, 42], [6, 182, 212], 'SUPPORT TECHNIQUE & ASSISTANCE 24/7 SECURIA', [56, 189, 248]);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text('• Plateforme en ligne : https://securia-pilot.netlify.app', margin + 4, curY + 11);
  doc.text('• Assistance technique & Support Déploiement : support@securia.ci', margin + 4, curY + 16);
  doc.text('• Ligne d\'astreinte technique des centres opérationnels : +225 07 00 00 00 00', margin + 4, curY + 21);

  drawFooter(7);

  // Sauvegarde des fichiers
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

  // 1. Sauvegarde racine
  const rootPath = path.join(process.cwd(), 'MANUEL_DE_FORMATION_SECURIA.pdf');
  fs.writeFileSync(rootPath, pdfBuffer);
  console.log('✅ PDF sauvegardé à la racine :', rootPath);

  // 2. Sauvegarde public/downloads pour téléchargement web
  const downloadsDir = path.join(process.cwd(), 'public', 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }
  const publicPath = path.join(downloadsDir, 'MANUEL_FORMATION_SECURIA.pdf');
  fs.writeFileSync(publicPath, pdfBuffer);
  console.log('✅ PDF sauvegardé dans public/downloads :', publicPath);

  console.log(`🎉 Génération terminée avec succès ! Taille : ${pdfBuffer.length} octets (${totalPages} pages).`);
}

createTrainingPdf();
