import { useState, useEffect } from "react";

const I18N = {
  en: {
    "nav.home": "Home",
    "nav.about": "About",
    "nav.locations": "Locations",
    "nav.sermons": "Sermons",
    "nav.connect": "Connect",
    "nav.give": "Give",
    "cta.give": "Give",
    "cta.plan": "Plan your visit",
    "footer.tag":
      "A community of believers gathering in Silver Spring and Alexandria — to worship Jesus, grow together, and carry the gospel forward.",
    "footer.rights": "© 2026 Addis Lidet International Church",
    "footer.sub": "Silver Spring, MD · Alexandria, VA",
    "hero.eyebrow": "Addis Lidet Int'l Church · Since 2008",
    "hero.title.1": "A new birth.",
    "hero.title.2": "A new life.",
    "hero.lede": "Two campuses. One family. Worshipping since 2008.",
    "hero.cta": "Plan your visit",
    "hero.watch": "Watch the latest",
  },
  am: {
    "nav.home": "መነሻ",
    "nav.about": "ስለ እኛ",
    "nav.locations": "አድራሻዎች",
    "nav.sermons": "ስብከቶች",
    "nav.connect": "ከእኛ ጋር",
    "nav.give": "መዋጮ",
    "cta.give": "ይዋጡ",
    "cta.plan": "ጉብኝትዎን ያቅዱ",
    "footer.tag":
      "የኢየሱስ ክርስቶስን ወንጌል የምታውጅ እና ቁርጥ ያሉ ደቀመዛሙርትን የምታሳድግ ቤተክርስቲያን እናያለን።",
    "footer.rights": "© 2026 አዲስ ልደት ዓለም አቀፍ ቤተክርስቲያን",
    "footer.sub": "Silver Spring, MD · Alexandria, VA",
    "hero.eyebrow": "አዲስ ልደት ዓለም አቀፍ ቤተክርስቲያን · ከ 2008 ጀምሮ",
    "hero.title.1": "አዲስ ልደት.",
    "hero.title.2": "አዲስ ሕይወት.",
    "hero.lede": "ሁለት ቅርንጫፎች። አንድ ቤተሰብ። ከ2008 ጀምሮ በአማርኛ ስብሰባ።",
    "hero.cta": "ጉብኝትዎን ያቅዱ",
    "hero.watch": "የቅርብ ጊዜ ስብከት ይመልከቱ",
  },
} as const;

type Lang = keyof typeof I18N;
type Key = keyof typeof I18N.en;

export function useI18n() {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return (localStorage.getItem("alic.lang") as Lang) || "en";
    } catch {
      return "en";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("alic.lang", lang);
    } catch {}
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "alic.lang" && e.newValue && e.newValue !== lang) {
        setLangState(e.newValue as Lang);
      }
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.lang) setLangState(detail.lang as Lang);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("alic:lang", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("alic:lang", onCustom);
    };
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    window.dispatchEvent(new CustomEvent("alic:lang", { detail: { lang: l } }));
  };

  const t = (key: Key): string => {
    const dict = I18N[lang] as Record<string, string>;
    return dict[key] ?? (I18N.en as Record<string, string>)[key] ?? key;
  };

  return { t, lang, setLang };
}
