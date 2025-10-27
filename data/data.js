

module.exports = [
  {
    _id: 1,
    name: "Epoxy Resin",
    main_use: ["Industrial coatings", "Adhesives"],
    composition_unit: "mol",
    raw_materials: [
      { name: "Bisphenol-A", ratio: 1 },
      { name: "Epichlorohydrin", ratio: 10 },
      { name: "NaOH", ratio: 0.2 }
    ]
  },
  {
    _id: 2,
    name: "Alkyd Resin",
    main_use: ["Paints", "Varnishes"],
    composition_unit: "wt%",
    raw_materials: [
      { name: "Phthalic Anhydride", ratio: 28 },
      { name: "Glycerol", ratio: 12 },
      { name: "Linseed Oil", ratio: 60 }
    ]
  },
  {
    _id: 3,
    name: "Acrylic Resin",
    main_use: ["Automotive paints"],
    composition_unit: "wt%",
    raw_materials: [
      { name: "MMA", ratio: 70 },
      { name: "BA", ratio: 25 },
      { name: "Styrene", ratio: 5 },
      { name: "Initiator", ratio: 1 }
    ]
  },
  {
    _id: 4,
    name: "Phenolic Resin",
    main_use: ["Industrial coatings", "Adhesives"],
    composition_unit: "mol",
    raw_materials: [
      { name: "Phenol", ratio: 1 },
      { name: "Formaldehyde", ratio: 2 },
      { name: "Catalyst", ratio: 0.01 }
    ]
  }
];


