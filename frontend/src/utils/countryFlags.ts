// Mapping from 3-letter IOC/IFSC codes to 2-letter ISO codes for flag emojis
const COUNTRY_CODE_MAP: Record<string, string> = {
  // Common climbing nations
  CHN: "CN",
  GBR: "GB",
  SLO: "SI",
  FRA: "FR",
  AUT: "AT",
  GER: "DE",
  JPN: "JP",
  KOR: "KR",
  USA: "US",
  ESP: "ES",
  ITA: "IT",
  CZE: "CZ",
  POL: "PL",
  UKR: "UA",
  RUS: "RU",
  SUI: "CH",
  BEL: "BE",
  NED: "NL",
  CAN: "CA",
  AUS: "AU",
  NZL: "NZ",
  BRA: "BR",
  ARG: "AR",
  MEX: "MX",
  IND: "IN",
  IRI: "IR",
  ISR: "IL",
  TUR: "TR",
  GRE: "GR",
  HUN: "HU",
  ROU: "RO",
  SRB: "RS",
  CRO: "HR",
  SVK: "SK",
  BUL: "BG",
  POR: "PT",
  SWE: "SE",
  NOR: "NO",
  FIN: "FI",
  DEN: "DK",
  IRL: "IE",
  SCO: "GB",
  WAL: "GB",
  ENG: "GB",
  RSA: "ZA",
  EGY: "EG",
  MAR: "MA",
  TUN: "TN",
  CHI: "CL",
  COL: "CO",
  PER: "PE",
  VEN: "VE",
  ECU: "EC",
  URU: "UY",
  TPE: "TW",
  HKG: "HK",
  MAS: "MY",
  SIN: "SG",
  THA: "TH",
  VIE: "VN",
  PHI: "PH",
  INA: "ID",
  KAZ: "KZ",
  UZB: "UZ",
  GEO: "GE",
  ARM: "AM",
  AZE: "AZ",
  EST: "EE",
  LAT: "LV",
  LTU: "LT",
  BLR: "BY",
  MDA: "MD",
  LUX: "LU",
  MLT: "MT",
  CYP: "CY",
  ISL: "IS",
  MNE: "ME",
  MKD: "MK",
  BIH: "BA",
  ALB: "AL",
  KOS: "XK",
  AND: "AD",
  MON: "MC",
  LIE: "LI",
  SMR: "SM",
};

/**
 * Convert a country code (2 or 3 letter) to a flag emoji.
 * Handles 3-letter IOC/IFSC codes by mapping them to 2-letter ISO codes.
 */
export function getFlagEmoji(countryCode: string | null): string {
  if (!countryCode) return "🏳️";

  // Convert 3-letter code to 2-letter if needed
  let isoCode = countryCode.toUpperCase();
  if (isoCode.length === 3) {
    isoCode = COUNTRY_CODE_MAP[isoCode] || isoCode.slice(0, 2);
  }

  // Only use first 2 characters for flag emoji
  const twoLetterCode = isoCode.slice(0, 2);

  const codePoints = twoLetterCode
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));

  try {
    return String.fromCodePoint(...codePoints);
  } catch {
    return "🏳️";
  }
}
