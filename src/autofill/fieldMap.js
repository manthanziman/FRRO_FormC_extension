const db = (path) => ({ kind: "db", path });
const manual = { kind: "manual" };

const sourceFields = [
  { id: "lastName", label: "Surname", selector: null, labels: ["surname"], section: "Personal Details", type: "text", required: false, source: db("guest.lastName") },
  { id: "firstName", label: "Given name", selector: null, labels: ["given name"], section: "Personal Details", type: "text", required: false, source: db("guest.firstName") },
  { id: "gender", label: "Sex", selector: null, labels: ["sex"], section: "Personal Details", type: "select", required: false, source: db("guest.gender"), transform: "gender" },
  { id: "dob", label: "Date of birth", selector: null, labels: ["date of birth"], section: "Personal Details", type: "date", required: false, source: db("guest.dob"), transform: "date" },
  { id: "age", label: "Age", selector: null, labels: ["age"], section: "Personal Details", type: "text", required: false, source: db("guest.age") },
  { id: "nationality", label: "Nationality", selector: null, labels: ["nationality"], section: "Personal Details", type: "select", required: false, source: db("guest.nationality"), transform: "country" },
  { id: "address", label: "Permanent address", selector: null, labels: ["address in country where residing permanently", "address"], section: "Address in country where residing permanently", type: "text", required: false, source: db("guest.address") },
  { id: "city", label: "Permanent city", selector: null, labels: ["city"], section: "Address in country where residing permanently", type: "text", required: false, source: db("guest.city") },
  { id: "passportNumber", label: "Passport no.", selector: null, labels: ["passport no"], section: "Passport Details", type: "text", required: false, source: db("guest.passportNumber"), transform: "uppercase" },
  { id: "passportIssuingCity", label: "Passport issue city", selector: null, labels: ["place of issue city"], section: "Passport Details", type: "text", required: false, source: db("guest.passportIssuingCity") },
  { id: "passportIssuingCountry", label: "Passport issue country", selector: null, labels: ["place of issue country"], section: "Passport Details", type: "select", required: false, source: db("guest.passportIssuingCountry"), transform: "country" },
  { id: "passportIssueDate", label: "Passport date of issue", selector: null, labels: ["date of issue"], section: "Passport Details", type: "date", required: false, source: db("guest.passportIssueDate"), transform: "date" },
  { id: "passportExpiryDate", label: "Passport valid till", selector: null, labels: ["valid till"], section: "Passport Details", type: "date", required: false, source: db("guest.passportExpiryDate"), transform: "date" },
  { id: "visaNumber", label: "Visa no.", selector: null, labels: ["visa no"], section: "Visa Details", type: "text", required: false, source: db("guest.visaNumber"), transform: "uppercase" },
  { id: "visaIssuingCity", label: "Visa issue city", selector: null, labels: ["place of issue city"], section: "Visa Details", type: "text", required: false, source: db("guest.visaIssuingCity") },
  { id: "visaIssuingCountry", label: "Visa issue country", selector: null, labels: ["place of issue country"], section: "Visa Details", type: "select", required: false, source: db("guest.visaIssuingCountry"), transform: "country" },
  { id: "visaIssueDate", label: "Visa date of issue", selector: null, labels: ["date of issue"], section: "Visa Details", type: "date", required: false, source: db("guest.visaIssueDate"), transform: "date" },
  { id: "visaExpiryDate", label: "Visa valid till", selector: null, labels: ["valid till"], section: "Visa Details", type: "date", required: false, source: db("guest.visaExpiryDate"), transform: "date" },
  { id: "visaType", label: "Type of visa", selector: null, labels: ["type of visa"], section: "Visa Details", type: "select", required: false, source: db("guest.visaType"), transform: "location" },
  { id: "checkInDate", label: "Date of arrival at property", selector: null, labels: [], section: "Arrival Information", type: "date", required: false, source: db("booking.checkInDate"), transform: "date", regex: "^date of arrival in (?!india)" },
  { id: "purpose", label: "Purpose of visit", selector: null, labels: ["purpose of visit"], section: "Other Details", type: "select", required: false, source: db("booking.purpose"), transform: "location" },
  { id: "mobile", label: "Mobile (home country)", selector: null, labels: ["mobile no permanently residing country"], section: "Other Details", type: "text", required: false, source: db("guest.mobile") },

  { id: "permanentCountry", label: "Permanent country", selector: null, labels: ["country"], section: "Address in country where residing permanently", type: "select", required: false, source: manual, transform: "country" },
  { id: "currentAddress", label: "Address in India", selector: null, labels: ["address reference in india", "address"], section: "Address/Reference in India", type: "text", required: false, source: manual },
  { id: "indiaState", label: "State (India)", selector: null, labels: ["state"], section: "Address/Reference in India", type: "select", required: false, source: manual, transform: "location" },
  { id: "indiaCity", label: "City/District (India)", selector: null, labels: ["city district"], section: "Address/Reference in India", type: "select", required: false, source: manual, transform: "location" },
  { id: "indiaPin", label: "PIN code", selector: null, labels: ["pin code"], section: "Address/Reference in India", type: "text", required: false, source: manual },
  { id: "visaSubType", label: "Visa sub type", selector: null, labels: ["visa sub type"], section: "Visa Details", type: "select", required: false, source: manual, transform: "location" },
  { id: "arrivedFromCountry", label: "Arrived from country", selector: null, labels: ["arrived from country"], section: "Arrival Information", type: "select", required: false, source: manual, transform: "country" },
  { id: "arrivedFromCity", label: "Arrived from city", selector: null, labels: ["arrived from city"], section: "Arrival Information", type: "text", required: false, source: manual },
  { id: "arrivedFromPlace", label: "Arrived from place", selector: null, labels: ["arrived from place"], section: "Arrival Information", type: "text", required: false, source: manual },
  { id: "arrivalDate", label: "Date of arrival in India", selector: null, labels: ["date of arrival in india"], section: "Arrival Information", type: "date", required: false, source: manual, transform: "date" },
  { id: "checkInTime", label: "Time of arrival at property", selector: null, labels: [], section: "Arrival Information", type: "text", required: false, source: manual, regex: "^time of arrival in" },
  { id: "stayDays", label: "Intended stay (days)", selector: null, labels: [], section: "Arrival Information", type: "text", required: false, source: manual, regex: "^intended duration of stay in" },
  { id: "employedInIndia", label: "Employed in India", selector: null, labels: ["whether employed in india"], section: "Other Details", type: "radio", required: false, source: manual },
  { id: "nextDestinationType", label: "Next destination (inside/outside)", selector: null, labels: ["next destination"], section: "Other Details", type: "radio", required: false, source: manual },
  { id: "nextState", label: "Next destination state", selector: null, labels: ["state"], section: "Other Details", type: "select", required: false, source: manual, transform: "location" },
  { id: "nextCity", label: "Next destination city/district", selector: null, labels: ["city district"], section: "Other Details", type: "select", required: false, source: manual, transform: "location" },
  { id: "nextPlace", label: "Next destination place", selector: null, labels: ["place"], section: "Other Details", type: "text", required: false, source: manual },
];

const fillOrder = [
  "lastName", "firstName", "gender", "dob", "age", "nationality",
  "address", "city", "permanentCountry",
  "currentAddress", "indiaState", "indiaCity", "indiaPin",
  "passportNumber", "passportIssuingCity", "passportIssuingCountry",
  "passportIssueDate", "passportExpiryDate",
  "visaNumber", "visaIssuingCity", "visaIssuingCountry", "visaIssueDate",
  "visaExpiryDate", "visaType", "visaSubType",
  "arrivedFromCountry", "arrivedFromCity", "arrivedFromPlace", "arrivalDate",
  "checkInDate", "checkInTime", "stayDays", "employedInIndia",
  "purpose", "mobile", "nextDestinationType", "nextState", "nextCity", "nextPlace",
];
const order = new Map(fillOrder.map((id, index) => [id, index]));

export const fieldMap = sourceFields
  .sort((left, right) => order.get(left.id) - order.get(right.id))
  .map((field) => ({ ...field, required: null }));
