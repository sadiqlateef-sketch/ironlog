// Student lens (F34): short, cited notes on the nutrients Ironlog shows.
// Written from NIH Office of Dietary Supplements and MedlinePlus pages. Numbers
// appear only where the cited page states them, as general adult reference
// values. Educational, not medical advice.

export interface LensSource {
  title: string;
  url: string;
  /** "YYYY-MM-DD" the page was read. */
  accessed: string;
}

export interface LensCard {
  key: string;
  title: string;
  body: string[];
  /** One sentence from `body` used by the quiz, and the word it blanks out. */
  fact: string;
  answer: string;
  sources: LensSource[];
}

export const LENS_DISCLAIMER = "Educational, not medical advice.";

const ACCESSED = "2026-11-13";
const src = (title: string, url: string): LensSource => ({ title, url, accessed: ACCESSED });

export const LENS_CARDS: readonly LensCard[] = [
  {
    key: "energy",
    title: "Energy (calories)",
    body: [
      "Calories measure the energy in food and drink. Protein, carbohydrates and fat all supply it.",
      "Needs differ from person to person with body size, age and activity, so Ironlog shows your own goal rather than a general number.",
    ],
    fact: "Protein, carbohydrates and fat all supply energy.",
    answer: "fat",
    sources: [src("Nutrition (MedlinePlus)", "https://medlineplus.gov/nutrition.html"), src("Dietary Fats (MedlinePlus)", "https://medlineplus.gov/dietaryfats.html")],
  },
  {
    key: "protein",
    title: "Protein",
    body: [
      "Protein helps the body repair cells and make new ones.",
      "It comes from animal foods such as meat, fish, eggs and dairy, and from plant foods such as soy, beans, lentils and whole grains.",
    ],
    fact: "Protein helps the body repair cells and make new ones.",
    answer: "repair",
    sources: [src("Protein in diet (MedlinePlus)", "https://medlineplus.gov/ency/article/002467.htm")],
  },
  {
    key: "carbohydrates",
    title: "Carbohydrates",
    body: [
      "Carbohydrates are a main source of energy. They include sugars, starches and fiber.",
      "The body breaks sugars and most starches down into glucose for fuel. Whole grains, fruit, vegetables and beans are described as better sources than refined, sugary foods.",
    ],
    fact: "The body breaks sugars and most starches down into glucose for fuel.",
    answer: "glucose",
    sources: [src("Carbohydrates (MedlinePlus)", "https://medlineplus.gov/ency/article/002469.htm")],
  },
  {
    key: "fat",
    title: "Fat",
    body: [
      "The body needs some fat for energy and to absorb certain vitamins.",
      "Fat has about twice the calories of protein or carbohydrates. MedlinePlus suggests limiting saturated and trans fats and choosing oils such as olive or canola instead.",
    ],
    fact: "Fat has about twice the calories of protein or carbohydrates.",
    answer: "twice",
    sources: [src("Dietary Fats (MedlinePlus)", "https://medlineplus.gov/dietaryfats.html")],
  },
  {
    key: "fiber",
    title: "Fiber",
    body: [
      "Fiber, found in fruit, vegetables and grains, helps digestion and can help you feel full sooner.",
      "MedlinePlus gives 21 to 38 grams a day for adults and older children, and suggests adding fiber gradually with plenty of fluids.",
    ],
    fact: "Fiber, found in fruit, vegetables and grains, helps digestion.",
    answer: "digestion",
    sources: [src("Fiber (MedlinePlus)", "https://medlineplus.gov/ency/article/002470.htm")],
  },
  {
    key: "sugars",
    title: "Sugars",
    body: [
      "Sugars occur naturally in foods such as fruit and milk, and are added to many processed foods.",
      "Added sugar supplies calories without vitamins, minerals or fiber. The USDA guidance cited by MedlinePlus keeps added sugars under 10% of daily calories.",
    ],
    fact: "Added sugar supplies calories without vitamins, minerals or fiber.",
    answer: "calories",
    sources: [src("Sweeteners - sugars (MedlinePlus)", "https://medlineplus.gov/ency/article/002444.htm")],
  },
  {
    key: "sodium",
    title: "Sodium",
    body: [
      "Sodium helps control blood pressure and blood volume and is needed for muscles and nerves.",
      "MedlinePlus gives 2,300 mg a day as the limit for healthy adults, and lower for people with high blood pressure. Processed meats, canned soups and fast food are common sources.",
    ],
    fact: "Sodium helps control blood pressure and blood volume.",
    answer: "pressure",
    sources: [src("Sodium in diet (MedlinePlus)", "https://medlineplus.gov/ency/article/002415.htm")],
  },
  {
    key: "caffeine",
    title: "Caffeine",
    body: [
      "Caffeine can cause a fast heart rate, anxiety, restlessness and trouble sleeping.",
      "MedlinePlus describes about 400 mg a day as an average or moderate amount for most people. People with sleep problems, reflux, high blood pressure or heart rhythm problems may want less.",
    ],
    fact: "Caffeine can cause a fast heart rate, anxiety, restlessness and trouble sleeping.",
    answer: "sleeping",
    sources: [src("Caffeine in the diet (MedlinePlus)", "https://medlineplus.gov/ency/article/002445.htm")],
  },
  {
    key: "water",
    title: "Water",
    body: [
      "Water makes up more than two-thirds of body weight, and cells and organs depend on it.",
      "MedlinePlus gives about 2.7 to 3.7 liters a day for adults, from food and drinks together; needs vary with heat and activity.",
    ],
    fact: "Water makes up more than two-thirds of body weight.",
    answer: "two-thirds",
    sources: [src("Water in diet (MedlinePlus)", "https://medlineplus.gov/ency/article/002471.htm")],
  },
  {
    key: "creatine",
    title: "Creatine",
    body: [
      "Creatine is made in the body and found in meat and fish. As a supplement it is one of the most studied for short, high-intensity exercise such as lifting.",
      "The NIH fact sheet notes that results vary between people. A doctor or pharmacist is the person to ask before starting any supplement.",
    ],
    fact: "Creatine is made in the body and found in meat and fish.",
    answer: "fish",
    sources: [
      src("Dietary Supplements for Exercise and Athletic Performance (NIH ODS)", "https://ods.od.nih.gov/factsheets/ExerciseAndAthleticPerformance-Consumer/"),
    ],
  },
  {
    key: "vitaminD",
    title: "Vitamin D",
    body: [
      "Vitamin D helps the body absorb calcium, one of the main building blocks of bone.",
      "The body makes it when skin is in sunlight, and it is in a few foods such as fatty fish and fortified milk. The NIH notes that people who rarely spend time in the sun may get less of it.",
    ],
    fact: "Vitamin D helps the body absorb calcium.",
    answer: "calcium",
    sources: [src("Vitamin D fact sheet for consumers (NIH ODS)", "https://ods.od.nih.gov/factsheets/VitaminD-Consumer/")],
  },
];
