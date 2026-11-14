// État global de l'application

// Version sémantique app affichée dans le profil. Incrémente à chaque release.
export const APP_VERSION = '5.0';

// Version admin (true) : « Relancer le tutoriel » dans Options. Version utilisateur : false.
export const IS_ADMIN = true;

export const State = {
  profile: null,
  quests: [],
  completions: [],
  activities: [],
  workLogs: [],
  exams: [],
  schedule: [],
  records: {},
  currentRoute: 'home',
  currentActivity: null,
  map: null,
  mapTrack: null,
  charts: {}
};
