/**
 * CLM Defaults — hardcoded VIP pitch deck content.
 *
 * Lifted verbatim from the original CLMPresenter.jsx STATIC_SLIDES + slide JSX.
 * Entity.clmBranding (per-entity config) deep-merges over these — any field
 * left blank in admin branding falls back here.
 *
 * Shape mirrors backend/erp/models/Entity.js clmBranding sub-schema 1:1.
 */

export const CLM_DEFAULTS = {
  logoCircleUrl: '/clm/vip-logo-circle.svg',
  logoTrademarkUrl: '/clm/vip-trademark.png',
  primaryColor: '#D4A017',
  companyName: 'VIP Inc.',
  websiteUrl: 'vippharmacy.online',
  salesEmail: 'sales@vippharmacy.online',
  phone: '0917 776 0079',
  slides: {
    hero: {
      titleAccent: 'Online Pharmacy',
      badge: 'PARTNERSHIP OPPORTUNITY',
      subtitle: 'A startup pharma company capitalizing on local footprint, digitalization, and AI integration',
    },
    startup: {
      title: 'Who We Are',
      lead: 'VIP Inc. is a startup pharmaceutical company built on three pillars:',
      pillars: [
        { icon: '\u{1F4CD}', title: 'Local Footprint', body: 'Operating in areas big chains ignore. We know the communities we serve — your patients, your territory.' },
        { icon: '\u{1F4BB}', title: 'Digitalization', body: 'Online pharmacy at vippharmacy.online — patients order via Messenger, delivered to their door.' },
        { icon: '\u{1F916}', title: 'AI Integration', body: 'Smart inventory, demand forecasting, and automated patient engagement powered by AI.' },
      ],
    },
    solution: {
      title: 'Looking for a Partner to Grow With Us',
      lead: 'We are not selling to you — we are inviting you to build something together.',
      cards: [
        { icon: '\u{1F91D}', title: 'Partnership, Not Sales', body: 'You are not a customer. You are a co-builder. Your patients, your territory, our logistics.' },
        { icon: '\u{1F4E6}', title: 'All Products Available', body: 'Every pharma product you support for your patients will be available through VIP Pharmacy Online.' },
        { icon: '\u{1F69A}', title: 'We Handle Logistics', body: 'Ordering, inventory, delivery, and customer service — all handled by VIP. You focus on patients.' },
        { icon: '\u{1F4F1}', title: 'Messenger-First', body: 'Patients connect via Facebook Messenger — no app downloads, no complicated websites.' },
      ],
    },
    integrity: {
      title: 'Your Professional Integrity — Protected',
      lead: 'This partnership is designed to never jeopardize your standing as a healthcare professional.',
      cards: [
        { icon: '✅', title: 'No Conflict of Interest', body: 'You are not selling medicines directly. VIP handles all commercial transactions. Your role remains purely clinical.' },
        { icon: '✅', title: 'Patient Choice Preserved', body: 'Patients are free to buy from any pharmacy. VIP is simply an additional, more affordable option.' },
        { icon: '✅', title: 'Transparent Operations', body: 'All transactions are documented. Full audit trail. No hidden arrangements.' },
        { icon: '✅', title: 'FDA-Compliant', body: 'VIP Inc. operates with proper FDA licenses. All products are sourced from licensed distributors.' },
      ],
    },
    products: {
      footer: 'All pharma company products that you support will be available through the partnership.',
    },
    connect: {
      title: "Let's Grow Together",
      subtitle: 'Interested in learning more about the partnership?',
      messengerTitle: 'Messenger Integration',
      messengerBody: 'Coming soon — pending Meta approval',
    },
  },
};

/**
 * Deep-merge an (optional) per-entity branding object over CLM_DEFAULTS.
 * - Missing scalars fall back to defaults.
 * - Card/pillar arrays are all-or-nothing: if the branding array is a
 *   non-empty array, use it verbatim; else use the default array.
 *   (Mixing partial arrays would leave empty-slot UI artifacts.)
 */
export function resolveClmConfig(branding) {
  const b = branding || {};
  const bs = b.slides || {};
  const ds = CLM_DEFAULTS.slides;

  const mergeCards = (key, slideKey, cardKey) =>
    Array.isArray(bs[slideKey]?.[cardKey]) && bs[slideKey][cardKey].length > 0
      ? bs[slideKey][cardKey]
      : ds[slideKey][cardKey];

  return {
    logoCircleUrl: b.logoCircleUrl || CLM_DEFAULTS.logoCircleUrl,
    logoTrademarkUrl: b.logoTrademarkUrl || CLM_DEFAULTS.logoTrademarkUrl,
    primaryColor: b.primaryColor || CLM_DEFAULTS.primaryColor,
    companyName: b.companyName || CLM_DEFAULTS.companyName,
    websiteUrl: b.websiteUrl || CLM_DEFAULTS.websiteUrl,
    salesEmail: b.salesEmail || CLM_DEFAULTS.salesEmail,
    phone: b.phone || CLM_DEFAULTS.phone,
    slides: {
      hero: {
        titleAccent: bs.hero?.titleAccent || ds.hero.titleAccent,
        badge: bs.hero?.badge || ds.hero.badge,
        subtitle: bs.hero?.subtitle || ds.hero.subtitle,
      },
      startup: {
        title: bs.startup?.title || ds.startup.title,
        lead: bs.startup?.lead || ds.startup.lead,
        pillars: mergeCards('pillars', 'startup', 'pillars'),
      },
      solution: {
        title: bs.solution?.title || ds.solution.title,
        lead: bs.solution?.lead || ds.solution.lead,
        cards: mergeCards('cards', 'solution', 'cards'),
      },
      integrity: {
        title: bs.integrity?.title || ds.integrity.title,
        lead: bs.integrity?.lead || ds.integrity.lead,
        cards: mergeCards('cards', 'integrity', 'cards'),
      },
      products: {
        footer: bs.products?.footer || ds.products.footer,
      },
      connect: {
        title: bs.connect?.title || ds.connect.title,
        subtitle: bs.connect?.subtitle || ds.connect.subtitle,
        messengerTitle: bs.connect?.messengerTitle || ds.connect.messengerTitle,
        messengerBody: bs.connect?.messengerBody || ds.connect.messengerBody,
      },
    },
  };
}

export default CLM_DEFAULTS;
