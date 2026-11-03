const normalize = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s._-]+/g, " ");

export function formatDate(value, context = {}) {
  if (!value) return "";
  const raw = String(value);
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = dateOnly ? null : value instanceof Date ? value : new Date(value);
  if (!dateOnly && Number.isNaN(date.getTime())) return null;

  const yyyy = dateOnly ? dateOnly[1] : String(date.getUTCFullYear()).padStart(4, "0");
  const mm = dateOnly ? dateOnly[2] : String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = dateOnly ? dateOnly[3] : String(date.getUTCDate()).padStart(2, "0");
  const parsed = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (
    parsed.getUTCFullYear() !== Number(yyyy) ||
    parsed.getUTCMonth() + 1 !== Number(mm) ||
    parsed.getUTCDate() !== Number(dd)
  ) {
    return null;
  }
  return context.inputType === "date" ? `${yyyy}-${mm}-${dd}` : `${dd}/${mm}/${yyyy}`;
}

export function matchFormOption(value, context = {}) {
  if (value === null || value === undefined || value === "") return "";
  const options = context.options ?? [];
  const wanted = normalize(value);
  const match = options.find(
    (option) =>
      normalize(option.value) === wanted || normalize(option.label) === wanted,
  );
  return match ? match.value : null;
}

function matchOptionContaining(value, context, aliases = {}) {
  const exact = matchFormOption(value, context);
  if (exact !== null) return exact;

  const candidates = aliases[normalize(value)] ?? [normalize(value)];
  const option = (context.options ?? []).find((candidate) =>
    candidates.some((alias) => normalize(candidate.label).includes(alias)),
  );
  return option?.value ?? null;
}

export function transformGender(value, context) {
  const aliases = { m: "male", f: "female", o: "other" };
  const normalized = normalize(value);
  return matchFormOption(aliases[normalized] ?? value, context);
}

export function transformCountry(value, context) {
  const aliases = {
    american: "united states",
    british: "united kingdom",
    french: "france",
    german: "germany",
    japanese: "japan",
    russian: "russia",
    spanish: "spain",
  };
  return matchFormOption(aliases[normalize(value)] ?? value, context);
}

export function transformLocation(value, context) {
  return matchFormOption(value, context);
}

export function transformVisaType(value, context) {
  const aliases = {
    tourist: ["tourist"],
    tourism: ["tourist", "tourism"],
    business: ["business"],
    medical: ["medical"],
  };
  return matchOptionContaining(value, context, aliases);
}

export function transformPurpose(value, context) {
  const aliases = { tourism: ["tourism", "tourist"] };
  return matchOptionContaining(value, context, aliases);
}

export function uppercase(value) {
  return value == null ? "" : String(value).toLocaleUpperCase();
}

export const transformers = {
  date: formatDate,
  gender: transformGender,
  country: transformCountry,
  location: transformLocation,
  visaType: transformVisaType,
  purpose: transformPurpose,
  uppercase,
};
