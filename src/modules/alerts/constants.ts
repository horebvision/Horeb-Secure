import { AlertType, AlertStatus, AlertPriority } from './types';

export interface AlertTypeMeta {
  type: AlertType;
  label: string;
  description: string;
  defaultPriority: AlertPriority;
  color: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  iconName: string;
}

export const ALERT_TYPE_CONFIG: Record<AlertType, AlertTypeMeta> = {
  INTRUSION: {
    type: 'INTRUSION',
    label: 'Intrusion en cours',
    description: 'Effraction constatée, bris de vitre ou individu dans le bâtiment',
    defaultPriority: 'CRITICAL',
    color: '#ef4444',
    textColor: 'text-red-400',
    bgColor: 'bg-red-950/40',
    borderColor: 'border-red-600',
    iconName: 'ShieldAlert',
  },
  AGRESSION: {
    type: 'AGRESSION',
    label: 'Agression physique',
    description: 'Attaque physique imminente ou violences en cours',
    defaultPriority: 'CRITICAL',
    color: '#dc2626',
    textColor: 'text-rose-400',
    bgColor: 'bg-rose-950/40',
    borderColor: 'border-rose-600',
    iconName: 'AlertOctagon',
  },
  MENACE: {
    type: 'MENACE',
    label: 'Menace directe',
    description: 'Intimidation verbale, chantage ou harcèlement hostile',
    defaultPriority: 'HIGH',
    color: '#f97316',
    textColor: 'text-orange-400',
    bgColor: 'bg-orange-950/40',
    borderColor: 'border-orange-600',
    iconName: 'AlertTriangle',
  },
  PERSONNE_SUSPECTE: {
    type: 'PERSONNE_SUSPECTE',
    label: 'Personne suspecte',
    description: 'Rôdeur, repérage suspect autour de la propriété ou comportement anormal',
    defaultPriority: 'MEDIUM',
    color: '#eab308',
    textColor: 'text-yellow-400',
    bgColor: 'bg-yellow-950/40',
    borderColor: 'border-yellow-600',
    iconName: 'Eye',
  },
  URGENCE: {
    type: 'URGENCE',
    label: 'Urgence vitale / Incendie',
    description: 'Danger immédiat nécessitant une intervention rapide et assistance',
    defaultPriority: 'CRITICAL',
    color: '#f43f5e',
    textColor: 'text-pink-400',
    bgColor: 'bg-pink-950/40',
    borderColor: 'border-pink-600',
    iconName: 'Flame',
  },
};

export const ALERT_STATUS_CONFIG: Record<
  AlertStatus,
  { label: string; description: string; badgeClass: string; stepOrder: number }
> = {
  CREATED: {
    label: 'Créée',
    description: 'Alerte initialisée sur l’appareil',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    stepOrder: 0,
  },
  SENT: {
    label: 'Transmise',
    description: 'Alerte expédiée au serveur sécurisé',
    badgeClass: 'bg-blue-900/60 text-blue-300 border-blue-600 animate-pulse',
    stepOrder: 1,
  },
  RECEIVED: {
    label: 'Reçue au centre',
    description: 'Arrivée sur les écrans du centre de sécurité',
    badgeClass: 'bg-purple-900/60 text-purple-300 border-purple-600',
    stepOrder: 2,
  },
  ACKNOWLEDGED: {
    label: 'Prise en charge',
    description: 'Régulateur en cours d’analyse et d’affectation',
    badgeClass: 'bg-amber-900/60 text-amber-300 border-amber-600',
    stepOrder: 3,
  },
  ASSIGNED: {
    label: 'Agent affecté',
    description: 'Un agent de sécurité a été désigné pour la mission',
    badgeClass: 'bg-cyan-900/60 text-cyan-300 border-cyan-600',
    stepOrder: 4,
  },
  EN_ROUTE: {
    label: 'Agent en route',
    description: 'L’agent d’intervention se déplace vers le site',
    badgeClass: 'bg-indigo-900/60 text-indigo-300 border-indigo-600 animate-pulse',
    stepOrder: 5,
  },
  ARRIVED: {
    label: 'Agent sur place',
    description: 'L’agent est arrivé sur les lieux et intervient',
    badgeClass: 'bg-emerald-900/60 text-emerald-300 border-emerald-600',
    stepOrder: 6,
  },
  RESOLVED: {
    label: 'Résolue',
    description: 'Intervention terminée, sécurité rétablie',
    badgeClass: 'bg-green-900/60 text-green-300 border-green-600',
    stepOrder: 7,
  },
  CANCELLED: {
    label: 'Annulée',
    description: 'Alerte annulée par l’utilisateur',
    badgeClass: 'bg-slate-900 text-slate-400 border-slate-700',
    stepOrder: -1,
  },
  FALSE_ALARM: {
    label: 'Fausse alerte',
    description: 'Déclenchement accidentel sans anomalie',
    badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-600',
    stepOrder: -1,
  },
  ESCALATED: {
    label: 'Escaladée (Police/Secours)',
    description: 'Transmise aux forces de l’ordre ou secours publics',
    badgeClass: 'bg-rose-950 text-rose-300 border-rose-600 font-bold',
    stepOrder: -1,
  },
};
