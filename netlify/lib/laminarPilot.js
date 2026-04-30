// Configuration for the OIL/RLUSD ("Laminar Digital") settlement-rail pilot lead-gen workflow.
// Used by both the Apollo Prospector preset and the dedicated Laminar Pilot dashboard tab.
// Plain ES module so it can be imported from React components and (if needed) Node functions.

export const LAMINAR_PILOT_PROFILE = 'commodity_trading';

export const LAMINAR_SEGMENTS = {
  energy_traders: {
    id: 'energy_traders',
    label: 'Energy Traders',
    description: 'Physical crude buyer/seller treasury and operations teams. Working-capital pitch lands first here.',
    titles: [
      'CFO',
      'Chief Financial Officer',
      'Treasurer',
      'Head of Treasury',
      'Head of Trade Finance',
      'Trade Finance Director',
      'Director of Trade Finance',
      'VP Finance',
      'Settlement Manager',
      'Trade Finance Manager',
      'Head of Operations',
      'Trade Operations',
      'General Counsel'
    ],
    domains: [
      'mercuria.com',
      'vitol.com',
      'gunvorgroup.com',
      'trafigura.com',
      'castletoncommodities.com',
      'glencore.com',
      'kochind.com',
      'oxy.com',
      'coterra.com',
      'targaresources.com'
    ]
  },
  banks: {
    id: 'banks',
    label: 'Banks',
    description: 'Commodity finance, trade & supply chain finance, and digital-asset / RLUSD custody desks.',
    titles: [
      'Head of Commodity Finance',
      'Global Head of Commodity Finance',
      'Head of Trade & Supply Chain Finance',
      'Head of Trade and Supply Chain Finance',
      'Head of Transaction Banking',
      'Head of Structured Commodity Finance',
      'Head of Digital Assets',
      'Head of Stablecoin',
      'Digital Assets Lead',
      'Head of Trade Finance Operations',
      'Documentary Credit',
      'Letter of Credit Operations',
      'Commodity Credit'
    ],
    domains: [
      'bnymellon.com',
      'jpmorgan.com',
      'jpmorganchase.com',
      'citi.com',
      'sc.com',
      'standardchartered.com',
      'hsbc.com',
      'societegenerale.com',
      'ing.com',
      'rabobank.com',
      'bnpparibas.com',
      'mufgamericas.com',
      'sumitomocorp.com'
    ]
  },
  midstream: {
    id: 'midstream',
    label: 'Midstream / Storage',
    description: 'Pipeline operators (Magellan/Plains/Enbridge) and terminal storage (Vopak/Oiltanking/Kinder Morgan).',
    titles: [
      'VP Commercial',
      'Commercial Director',
      'Head of Terminals',
      'Director of Terminals',
      'Head of Storage',
      'Storage Operations Director',
      'Head of Scheduling',
      'Scheduling Manager',
      'Head of Nominations',
      'Nominations Manager',
      'Terminal Operations Manager'
    ],
    domains: [
      'magellanlp.com',
      'plainsallamerican.com',
      'enbridge.com',
      'kindermorgan.com',
      'vopak.com',
      'oiltanking.com',
      'energytransfer.com',
      'williams.com'
    ]
  },
  inspection: {
    id: 'inspection',
    label: 'Inspection / Certification',
    description: 'SGS, Bureau Veritas, Intertek — credentialed XRPL oracle providers for cargo quality/quantity.',
    titles: [
      'Head of Oil and Gas',
      'Global Head of Oil & Gas',
      'Oil and Gas Commercial Director',
      'Head of Inspection',
      'Inspection Services Director',
      'Director of Inspection Services',
      'Head of Digital Services',
      'Digital Services Director',
      'Head of Innovation'
    ],
    domains: [
      'sgs.com',
      'bureauveritas.com',
      'intertek.com',
      'corelab.com'
    ]
  }
};

export const LAMINAR_SEGMENT_ORDER = ['energy_traders', 'banks', 'midstream', 'inspection'];

export function getLaminarSegment(segmentId) {
  return LAMINAR_SEGMENTS[segmentId] || null;
}

export function getAllLaminarTitles() {
  return LAMINAR_SEGMENT_ORDER.flatMap((id) => LAMINAR_SEGMENTS[id].titles);
}

export function getAllLaminarDomains() {
  return LAMINAR_SEGMENT_ORDER.flatMap((id) => LAMINAR_SEGMENTS[id].domains);
}

// Tag a contact (already classified by tradeFinanceContacts) with a segment when the
// classifier didn't assign one — falls back to matching the contact's company domain
// against the segment's domain list, then to defaulting energy_traders.
export function inferContactSegment(contact = {}) {
  if (contact.segment) return contact.segment;
  if (contact.sourceMeta?.segment) return contact.sourceMeta.segment;

  const domain = (contact.email || contact.domain || contact.company || '').toLowerCase();
  for (const id of LAMINAR_SEGMENT_ORDER) {
    if (LAMINAR_SEGMENTS[id].domains.some((d) => domain.includes(d.replace(/\.com$/, '')))) {
      return id;
    }
  }
  return 'energy_traders';
}
