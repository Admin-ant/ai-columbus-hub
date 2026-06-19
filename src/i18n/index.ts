import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import nl from "./locales/nl.json";
import en from "./locales/en.json";

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        nl: { translation: nl },
        en: { translation: en },
      },
      fallbackLng: "nl",
      supportedLngs: ["nl", "en"],
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"],
        lookupLocalStorage: "portal.lang",
      },
    });
}

export default i18n;
