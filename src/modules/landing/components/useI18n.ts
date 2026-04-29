import { useState, useEffect } from "react";

const I18N = {
  en: {
    // Nav
    "nav.home": "Home",
    "nav.about": "About",
    "nav.locations": "Locations",
    "nav.ministries": "Ministries",
    "nav.connect": "Connect",
    "nav.give": "Give",
    "nav.login": "Log in",

    // CTA
    "cta.give": "Give",
    "cta.plan": "Plan your visit",
    "cta.directions": "Get directions",
    "cta.watchLive": "Watch live",
    "cta.watchLatest": "Watch the latest",
    "cta.saveSeat": "Save my seat",
    "cta.sendMessage": "Send message",

    // Hero
    "hero.eyebrow": "Addis Lidet Int'l Church · Since 2008",
    "hero.title.1": "A new birth.",
    "hero.title.2": "A new life.",
    "hero.lede": "Two campuses. One family. Worshipping since 2008.",
    "hero.cta": "Plan your visit",
    "hero.watch": "Watch the latest",

    // Sunday Gatherings
    "sg.eyebrow": "On Sunday · እሁድ",
    "sg.title": "Sunday gatherings.",
    "sg.body": "Sunday is our family table. We sing in the language our parents sang in, we open Scripture in the language our kids think in, and we make room for both generations to hear the Spirit together. Everyone is welcome — visitor, skeptic, longtime believer, brand-new seeker.",
    "sg.cta": "Plan your visit",

    // Locations
    "locs.eyebrow": "Two homes · ሁለት ቤቶች",
    "locs.title": "Find your nearest campus.",

    // Story
    "story.eyebrow": "Our story · ታሪካችን",
    "story.title": "From a small group to a family of thousands.",

    // Pastors
    "pastors.eyebrow": "Our pastors · አገልጋዮች",
    "pastors.title": "Shepherds for both homes.",

    // Watch
    "watch.eyebrow": "Watch",
    "watch.title": "Every Sunday, live. Every other day, on demand.",
    "watch.fullLibrary": "Full sermon library",

    // Connect
    "connect.eyebrow": "Plan your visit",
    "connect.title.1": "Come as you are.",
    "connect.title.2": "Stay as family.",
    "connect.lede": "Whether it's your first Sunday or your fiftieth, there's a seat, a cup of coffee, and a hand to shake. Let us know you're coming and we'll make sure someone finds you at the door.",
    "connect.formHead": "Let us know",
    "connect.name": "Your name",
    "connect.email": "Email",
    "connect.campus": "Campus",
    "connect.when": "When are you thinking of visiting?",
    "connect.when.thisSun": "This Sunday",
    "connect.when.nextSun": "Next Sunday",
    "connect.when.month": "Within a month",
    "connect.when.exploring": "Just exploring",
    "connect.fine": "Prefer to just show up? That's welcome too.",
    "connect.seeTimes": "See service times",

    // About
    "about.eyebrow": "About · ስለ እኛ",
    "about.timeline.eyebrow": "Our story · ታሪካችን",
    "about.vision.eyebrow": "Vision · ራዕይ",
    "about.mission.eyebrow": "Mission · ተልዕኮ",
    "about.beliefs.eyebrow": "What we believe",
    "about.leaders.eyebrow": "Shepherds · እረኞቻችን",
    "about.mission.strip.eyebrow": "ALIC Mission · አገልግሎት",

    // Sermons
    "sermons.eyebrow": "Watch & listen · Sermon archive",
    "sermons.schedule.eyebrow": "Weekly schedule",

    // Give
    "give.eyebrow": "An act of worship",

    // Footer
    "footer.tag":
      "A community of believers gathering in Silver Spring and Alexandria — to worship Jesus, grow together, and carry the gospel forward.",
    "footer.rights": "© 2026 Addis Lidet International Church",
    "footer.sub": "Silver Spring, MD · Alexandria, VA",
    "footer.visit": "Visit",
    "footer.explore": "Explore",
    "footer.contact": "Contact",
  },
  am: {
    // Nav
    "nav.home": "መነሻ",
    "nav.about": "ስለ እኛ",
    "nav.locations": "አድራሻዎች",
    "nav.ministries": "አገልግሎቶች",
    "nav.connect": "ከእኛ ጋር",
    "nav.give": "መዋጮ",
    "nav.login": "ግባ",

    // CTA
    "cta.give": "ይዋጡ",
    "cta.plan": "ጉብኝትዎን ያቅዱ",
    "cta.directions": "አቅጣጫ ያግኙ",
    "cta.watchLive": "በቀጥታ ይመልከቱ",
    "cta.watchLatest": "የቅርብ ጊዜ ስብከት ይመልከቱ",
    "cta.saveSeat": "ቦታዬን ያስይዙ",
    "cta.sendMessage": "መልዕክት ላክ",

    // Hero
    "hero.eyebrow": "አዲስ ልደት ዓለም አቀፍ ቤተክርስቲያን · ከ 2008 ጀምሮ",
    "hero.title.1": "አዲስ ልደት.",
    "hero.title.2": "አዲስ ሕይወት.",
    "hero.lede": "ሁለት ቅርንጫፎች። አንድ ቤተሰብ። ከ2008 ጀምሮ በአማርኛ ስብሰባ።",
    "hero.cta": "ጉብኝትዎን ያቅዱ",
    "hero.watch": "የቅርብ ጊዜ ስብከት ይመልከቱ",

    // Sunday Gatherings
    "sg.eyebrow": "እሁድ · On Sunday",
    "sg.title": "የእሁድ ስብሰባዎች።",
    "sg.body": "እሁድ ቤተሰባዊ ጠረጴዛችን ነው። ወላጆቻችን በሚዘምሩበት ቋንቋ እንዘምራለን፣ ልጆቻችን በሚያስቡበት ቋንቋ መጽሐፍ ቅዱስን እንከፍታለን፣ እና ሁለቱም ትውልዶች መንፈስ ቅዱስን አብረው እንዲሰሙ ቦታ እንሰጣለን።",
    "sg.cta": "ጉብኝትዎን ያቅዱ",

    // Locations
    "locs.eyebrow": "ሁለት ቤቶች · Two homes",
    "locs.title": "የቅርብ ቅርንጫፍዎን ያግኙ።",

    // Story
    "story.eyebrow": "ታሪካችን · Our story",
    "story.title": "ከትንሽ ቡድን እስከ የሺዎች ቤተሰብ።",

    // Pastors
    "pastors.eyebrow": "አገልጋዮች · Our pastors",
    "pastors.title": "ለሁለቱም ቤቶች እረኞች።",

    // Watch
    "watch.eyebrow": "ይመልከቱ",
    "watch.title": "በየእሁድ፣ በቀጥታ። በየቀኑ፣ በፍላጎት።",
    "watch.fullLibrary": "ሙሉ የስብከት ቤተ-መጽሐፍት",

    // Connect
    "connect.eyebrow": "ጉብኝትዎን ያቅዱ",
    "connect.title.1": "እንደ ያሉበት ይምጡ።",
    "connect.title.2": "እንደ ቤተሰብ ይቆዩ።",
    "connect.lede": "የመጀመሪያ እሁድዎ ይሁን ሃምሳኛ ይሁን፣ ወንበር፣ ቡና፣ እና ሰላምታ ይጠብቅዎታል።",
    "connect.formHead": "ያሳውቁን",
    "connect.name": "ስምዎ",
    "connect.email": "ኢሜል",
    "connect.campus": "ቅርንጫፍ",
    "connect.when": "መቼ ለመጎብኘት ያስባሉ?",
    "connect.when.thisSun": "ይህ እሁድ",
    "connect.when.nextSun": "ቀጣይ እሁድ",
    "connect.when.month": "በአንድ ወር ውስጥ",
    "connect.when.exploring": "እየመረመርኩ ነው",
    "connect.fine": "እንዲሁ ብቅ ማለት ይፈልጋሉ? እሺ ነው።",
    "connect.seeTimes": "የአገልግሎት ጊዜያት ይመልከቱ",

    // About
    "about.eyebrow": "ስለ እኛ · About",
    "about.timeline.eyebrow": "ታሪካችን · Our story",
    "about.vision.eyebrow": "ራዕይ · Vision",
    "about.mission.eyebrow": "ተልዕኮ · Mission",
    "about.beliefs.eyebrow": "እምነታችን",
    "about.leaders.eyebrow": "እረኞቻችን · Shepherds",
    "about.mission.strip.eyebrow": "አገልግሎት · ALIC Mission",

    // Sermons
    "sermons.eyebrow": "ይመልከቱ እና ያዳምጡ · የስብከት ማህደር",
    "sermons.schedule.eyebrow": "ሳምንታዊ መርሐ ግብር",

    // Give
    "give.eyebrow": "የአምልኮ ተግባር",

    // Footer
    "footer.tag":
      "የኢየሱስ ክርስቶስን ወንጌል የምታውጅ እና ቁርጥ ያሉ ደቀመዛሙርትን የምታሳድግ ቤተክርስቲያን እናያለን።",
    "footer.rights": "© 2026 አዲስ ልደት ዓለም አቀፍ ቤተክርስቲያን",
    "footer.sub": "Silver Spring, MD · Alexandria, VA",
    "footer.visit": "ይጎብኙ",
    "footer.explore": "ያስሱ",
    "footer.contact": "ያግኙን",
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
