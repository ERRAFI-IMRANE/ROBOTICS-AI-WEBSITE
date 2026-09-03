// ==============================================================================
// Official EST Safi Academic Hierarchy & Registration Constants
// ==============================================================================

export const EST_SAFI_DEPARTMENTS = {
  "Maintenance Industrielle": [
    "Génie Industriel & Maintenance",
    "Génie Électrique et Systèmes Automatisés",
    "Mécatronique et Intelligence Artificielle",
  ],
  "Informatique": [
    "Génie Informatique",
    "Ingénierie des Systèmes d’Information et Réseaux",
  ],
  "Techniques de Management": [
    "Techniques de Management",
    "Gestion Comptable et Financière",
  ],
  "Techniques d’Analyses et Contrôle de Qualité": [
    "Énergie Durable et Hydrogène Vert",
    "Qualité, Hygiène, Sécurité et Environnement",
    "Instrumentation et Mesures Physico-Chimiques",
    "Métrologie, Qualité, Sécurité et Environnement",
  ],
};

export const DEPARTMENT_NAMES = Object.keys(EST_SAFI_DEPARTMENTS);

export const YEARS_OF_STUDY = [
  { value: "first_year", label: "First Year" },
  { value: "second_year", label: "Second Year" },
  { value: "bachelor", label: "Bachelor" },
  { value: "master", label: "Master" },
  { value: "phd", label: "PhD" },
];

export const getYearOfStudyLabel = (value) => {
  const found = YEARS_OF_STUDY.find((y) => y.value === value);
  return found ? found.label : value;
};
