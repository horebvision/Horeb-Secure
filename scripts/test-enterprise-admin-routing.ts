import { isPlatformAdminUser, MASTER_PLATFORM_ORG_ID, SUPER_ADMIN_EMAIL } from '../src/modules/users/types';
import { AuthService } from '../src/modules/auth/auth.service';

console.log('==============================================================================');
console.log('TEST DE VALIDATION : SÉGRÉGATION ROUTING SUPER ADMIN VS ADMIN ENTREPRISE');
console.log('==============================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✔ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ✖ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

// 1. Tests isPlatformAdminUser
const superAdminUser = {
  role: 'ADMIN',
  email: 'ahossancedric22@gmail.com',
  organizationId: MASTER_PLATFORM_ORG_ID,
};
assert(
  isPlatformAdminUser(superAdminUser) === true,
  '1. Le compte Super Admin (ahossancedric22@gmail.com / Master Org) est bien Platform Admin'
);

const horebVisionAdmin = {
  role: 'ADMIN',
  email: 'admin@horebvision.ci',
  organizationId: 'horeb-0000-0000-0000-000000000001',
};
assert(
  isPlatformAdminUser(horebVisionAdmin) === false,
  '2. Le compte Admin de Horeb Vision (Tenant non-master) N\'EST PAS Platform Admin'
);

const explicitPlatformAdminFlag = {
  role: 'ADMIN',
  email: 'custom.admin@securia.ci',
  organizationId: 'custom-org-id',
  isPlatformAdmin: true,
};
assert(
  isPlatformAdminUser(explicitPlatformAdminFlag) === true,
  '3. Le flag explicite isPlatformAdmin: true prévaut et accorde le statut Platform Admin'
);

const securityManager = {
  role: 'SECURITY_MANAGER',
  email: 'soc@horebvision.ci',
  organizationId: 'horeb-0000-0000-0000-000000000001',
};
assert(
  isPlatformAdminUser(securityManager) === false,
  '4. Un SECURITY_MANAGER n\'est jamais Platform Admin'
);

// 2. Tests AuthService.getRedirectPathForRole
assert(
  AuthService.getRedirectPathForRole('ADMIN', true) === '/admin',
  '5. Redirection de connexion Super Admin (Platform Admin: true) -> /admin'
);

assert(
  AuthService.getRedirectPathForRole('ADMIN', false) === '/dispatch',
  '6. Redirection de connexion Admin Entreprise Horeb Vision (Platform Admin: false) -> /dispatch'
);

assert(
  AuthService.getRedirectPathForRole('SECURITY_MANAGER') === '/dispatch',
  '7. Redirection de connexion Responsable Sécurité -> /dispatch'
);

assert(
  AuthService.getRedirectPathForRole('AGENT') === '/agent',
  '8. Redirection de connexion Agent Terrain -> /agent'
);

assert(
  AuthService.getRedirectPathForRole('USER') === '/dashboard',
  '9. Redirection de connexion Client Final -> /dashboard'
);

console.log('\n==============================================================================');
console.log(`RÉSULTATS : ${passed} / ${passed + failed} TESTS RÉUSSIS`);
console.log('==============================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
