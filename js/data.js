// services list, prices in PHP without VAT
export const SERVICES = [
  {
    id: "aerial-monitoring",
    index: "01",
    name: "Aerial Site Monitoring",
    description: "One drone flight with photos and video of your whole site.",
    price: 15000,
    unit: "per visit",
    features: ["Up to 30 minutes of flight", "4K video and 80 photos", "Close-ups of problem areas", "Files within 48 hours"],
    image: "images/drone-sky.jpg",
  },
  {
    id: "site-mapping",
    index: "02",
    name: "Site Mapping",
    description: "A measurable map and 3D model of your site.",
    price: 35000,
    unit: "per site, up to 5 ha",
    features: ["Top-down map at 2–3 cm detail", "3D model and contours", "Area and volume measurements", "CAD and PDF files"],
    image: "images/house-frames.jpg",
  },
  {
    id: "full-package",
    index: "03",
    name: "Full Monitoring Package",
    description: "Weekly flights, a monthly map and a monthly progress report.",
    price: 85000,
    unit: "per month",
    features: ["4 flights a month", "Updated map every month", "Progress comparison by date", "Monthly report", "One contact person"],
    image: "images/subdivision.jpg",
    featured: true,
    badge: "Best value",
  },
];

export const getService = (id) => SERVICES.find((s) => s.id === id);

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });

export const formatPHP = (n) => peso.format(Math.round(n));

export const VAT_RATE = 0.12;

export function totals(subtotal) {
  const vat = subtotal * VAT_RATE;
  return { subtotal, vat, total: subtotal + vat };
}
