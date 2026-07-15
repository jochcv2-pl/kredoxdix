// ESLint flat config pour Next.js — A-007 : format legacy .eslintrc.json
// reste plus robuste, mais ici on fournit une config legacy compatible.
// Les apps utilisent leur propre .eslintrc.json qui extends "next/core-web-vitals".
// Ce fichier est un fallback reference.
export default {
  root: true,
  extends: ["next/core-web-vitals"],
};
