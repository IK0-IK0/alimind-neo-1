export type PilotTpbConstruct = "attitude" | "subjectiveNorm" | "perceivedControl";

export interface PilotTpbQuestion {
  id: string;
  number: number;
  construct: PilotTpbConstruct;
  section: string;
  prompt: string;
}

export interface PilotTtmQuestion {
  id: string;
  number: number;
  prompt: string;
  dependsOn?: {
    questionNumber: number;
    answer: boolean;
  };
}

export type PilotAdditionalQuestionType = "text" | "number" | "singleSelect" | "multiSelect";

export interface PilotAdditionalQuestion {
  id: string;
  number: number;
  prompt: string;
  type: PilotAdditionalQuestionType;
  options?: string[];
  followUp?: string;
}

export interface PilotSurveySection {
  id: "tpb" | "ttm" | "additional";
  title: string;
  questions: PilotTpbQuestion[] | PilotTtmQuestion[] | PilotAdditionalQuestion[];
}

const question = (
  number: number,
  construct: PilotTpbConstruct,
  section: string,
  prompt: string,
): PilotTpbQuestion => ({
  id: `pilot-tpb-${String(number).padStart(2, "0")}`,
  number,
  construct,
  section,
  prompt,
});

export const PILOT_TPB_QUESTIONS: PilotTpbQuestion[] = [
  question(1, "attitude", "Behavioral Beliefs", "How likely do you think eating nutritious meals daily for the next month would improve your overall health and keep you healthy in the long run? What makes you think so?"),
  question(2, "attitude", "Behavioral Beliefs", "What effect do you think eating nutritious meals daily for the next month would have on your energy? What makes you think so?"),
  question(3, "attitude", "Behavioral Beliefs", "What effect do you think eating nutritious meals daily for the next month would have on your digestion, even if you feel bloated at first?"),
  question(4, "attitude", "Behavioral Beliefs", "How much do you think eating nutritious meals daily for the next month would help your body fight sickness? What makes you think so?"),
  question(5, "attitude", "Behavioral Beliefs", "What effect do you think eating nutritious meals daily for the next month would have on your ability to stay focused and think clearly?"),
  question(6, "attitude", "Behavioral Beliefs", "What effect do you think eating nutritious meals daily for the next month would have on maintaining a healthy weight and fit body?"),
  question(7, "attitude", "Behavioral Beliefs", "What kind of time, planning, and effort do you think eating nutritious meals daily for the next month would take?"),
  question(8, "attitude", "Behavioral Beliefs", "How affordable or expensive do you think eating nutritious meals daily for the next month would be for you? What affects the cost?"),
  question(9, "attitude", "Behavioral Beliefs", "How might eating nutritious meals daily for the next month affect the foods you love, your meal variety, or eating out with friends?"),
  question(10, "attitude", "Behavioral Beliefs", "How do you think eating nutritious meals daily for the next month would affect how proud, motivated, or in control of your health you feel?"),
  question(11, "attitude", "Outcome Evaluations", "How valuable is being healthy now and in the long run to you? What makes it valuable or not valuable?"),
  question(12, "attitude", "Outcome Evaluations", "How important would having more energy be to you? Why?"),
  question(13, "attitude", "Outcome Evaluations", "How important would having better digestion be to you? Why?"),
  question(14, "attitude", "Outcome Evaluations", "How important would it be to you to have a body that fights sickness well? Why?"),
  question(15, "attitude", "Outcome Evaluations", "How valuable is being able to focus and think clearly to you? Why?"),
  question(16, "attitude", "Outcome Evaluations", "How important is keeping a healthy weight and fit body to you? Why?"),
  question(17, "attitude", "Outcome Evaluations", "How do you feel about spending time planning and preparing nutritious meals? What makes that worthwhile or difficult for you?"),
  question(18, "attitude", "Outcome Evaluations", "How do you feel about spending money on nutritious food? What affects your view?"),
  question(19, "attitude", "Outcome Evaluations", "How would you feel about eating favorite less-healthy foods, having treats, or eating out with friends less often? Why?"),
  question(20, "attitude", "Attitude Toward the Behavior", "Overall, how beneficial or unhelpful would eating nutritious meals daily for the next month be for you? What makes you feel that way?"),
  question(21, "attitude", "Attitude Toward the Behavior", "How important does eating nutritious meals daily for the next month feel for your health? Why?"),
  question(22, "attitude", "Attitude Toward the Behavior", "How enjoyable or satisfying do you expect eating nutritious meals daily for the next month to be? What might make it more or less enjoyable?"),
  question(23, "attitude", "Attitude Toward the Behavior", "Considering the cost and effort, what would make eating nutritious meals daily for the next month feel worthwhile or not worthwhile to you?"),
  question(24, "attitude", "Attitude Toward the Behavior", "What is your overall opinion of eating nutritious meals daily for the next month? What makes it seem like a good or bad choice for you?"),
  question(25, "subjectiveNorm", "Normative Beliefs", "What does your family (parents and relatives) think about you eating nutritious meals daily for the next month? What have they said or done that gives you that impression?"),
  question(26, "subjectiveNorm", "Normative Beliefs", "What do your friends and classmates, including those who often eat fast food, think about you eating nutritious meals daily for the next month? What makes you think so?"),
  question(27, "subjectiveNorm", "Normative Beliefs", "What do health workers or fitness experts (such as doctors, nurses, dietitians, coaches, or trainers) think about you eating nutritious meals daily for the next month?"),
  question(28, "subjectiveNorm", "Normative Beliefs", "What do the people you live with think about you eating nutritious meals daily for the next month?"),
  question(29, "subjectiveNorm", "Normative Beliefs", "How do the people who are important to you feel about you eating nutritious meals daily for the next month?"),
  question(30, "subjectiveNorm", "Motivation to Comply", "How much does your family's opinion influence your choices about health and food? Can you share an example?"),
  question(31, "subjectiveNorm", "Motivation to Comply", "How much do your friends' or classmates' opinions influence your choices about health and food? Can you share an example?"),
  question(32, "subjectiveNorm", "Motivation to Comply", "How much do the opinions of doctors, dietitians, coaches, or trainers influence your choices about health and food?"),
  question(33, "subjectiveNorm", "Motivation to Comply", "How much do the opinions of the people you live with influence your choices about health and food?"),
  question(34, "subjectiveNorm", "Subjective Norm", "How supportive or disapproving do you think the people important to you would be if you ate nutritious meals daily for the next month? What makes you think so?"),
  question(35, "subjectiveNorm", "Subjective Norm", "What expectations, if any, do other people have of you about eating nutritious meals daily for the next month?"),
  question(36, "subjectiveNorm", "Subjective Norm", "Among people like you, including health-conscious people and busy students on a tight budget, how common is it to try to eat nutritious meals daily?"),
  question(37, "perceivedControl", "Control Beliefs", "How much would having enough money or a set grocery budget help you eat nutritious meals daily for the next month? What difference would it make?"),
  question(38, "perceivedControl", "Control Beliefs", "How would having enough time, for example for weekend meal prep, affect your ability to eat nutritious meals daily for the next month?"),
  question(39, "perceivedControl", "Control Beliefs", "How would having a kitchen or basic cooking equipment affect your ability to eat nutritious meals daily for the next month?"),
  question(40, "perceivedControl", "Control Beliefs", "How would knowing how to cook and which foods are healthy affect your ability to eat nutritious meals daily for the next month?"),
  question(41, "perceivedControl", "Control Beliefs", "How would having affordable, fresh fruits, vegetables, and whole grains nearby affect your ability to eat nutritious meals daily for the next month?"),
  question(42, "perceivedControl", "Control Beliefs", "How would having a simple weekly meal plan and self-discipline affect your ability to eat nutritious meals daily for the next month?"),
  question(43, "perceivedControl", "Control Beliefs", "How would support from your family, friends, or housemates affect your ability to eat nutritious meals daily for the next month?"),
  question(44, "perceivedControl", "Control Beliefs", "How much might cravings for fast food, snacks, or sugary drinks, or seeing tempting food online or around friends, make it harder to eat nutritious meals daily for the next month?"),
  question(45, "perceivedControl", "Control Beliefs", "How might a busy schedule, stress, social events, or travel affect how easy or difficult it is for you to eat nutritious meals daily for the next month?"),
  question(46, "perceivedControl", "Control Beliefs", "How might limited healthy food options or being a picky eater affect your ability to eat nutritious meals daily for the next month?"),
  question(47, "perceivedControl", "Perceived Power", "If you had enough money or a set grocery budget, how would that change how easy or difficult it is to eat nutritious meals daily?"),
  question(48, "perceivedControl", "Perceived Power", "If you had enough time, including time for weekend meal prep, how would that change how easy or difficult it is to eat nutritious meals daily?"),
  question(49, "perceivedControl", "Perceived Power", "If you had a kitchen or cooking equipment, how would that change how easy or difficult it is to eat nutritious meals daily?"),
  question(50, "perceivedControl", "Perceived Power", "If you knew how to cook and which foods are healthy, how would that change how easy or difficult it is to prepare nutritious meals?"),
  question(51, "perceivedControl", "Perceived Power", "If you had a simple meal plan and self-discipline, how would that change how easy or difficult it is to eat nutritious meals daily?"),
  question(52, "perceivedControl", "Perceived Power", "If you had support from family, friends, or housemates, how would that change how easy or difficult it is to eat nutritious meals daily?"),
  question(53, "perceivedControl", "Perceived Behavioral Control", "How manageable or difficult would it be for you to eat nutritious meals daily for the next month? What would make it easier or harder?"),
  question(54, "perceivedControl", "Perceived Behavioral Control", "What makes you feel able or unable to eat nutritious meals daily for the next month if you decided to do so?"),
  question(55, "perceivedControl", "Perceived Behavioral Control", "How much control do you feel you have over eating nutritious meals daily for the next month? What is within your control, and what is not?"),
  question(56, "perceivedControl", "Perceived Behavioral Control", "How much does eating nutritious meals daily for the next month feel like it is up to you? What affects that feeling?"),
  question(57, "perceivedControl", "Perceived Behavioral Control", "How confident do you feel about eating nutritious meals daily even when you are busy, stressed, or around friends eating fast food? What helps or gets in the way?"),
];

export const PILOT_TTM_QUESTIONS: PilotTtmQuestion[] = [
  {
    id: "pilot-ttm-63",
    number: 63,
    prompt: "Do you currently follow a healthy eating pattern as described above?",
  },
  {
    id: "pilot-ttm-64",
    number: 64,
    prompt: "Have you been following a healthy eating pattern for more than 1 month?",
    dependsOn: { questionNumber: 63, answer: true },
  },
  {
    id: "pilot-ttm-65",
    number: 65,
    prompt: "Do you intend to start following a healthy eating pattern in the next month?",
    dependsOn: { questionNumber: 63, answer: false },
  },
  {
    id: "pilot-ttm-66",
    number: 66,
    prompt: "Do you intend to start following a healthy eating pattern in the next week?",
    dependsOn: { questionNumber: 65, answer: true },
  },
];

export const PILOT_ADDITIONAL_QUESTIONS: PilotAdditionalQuestion[] = [
  { id: "pilot-additional-67", number: 67, prompt: "What is your age in years?", type: "number" },
  {
    id: "pilot-additional-68",
    number: 68,
    prompt: "How reliable is your internet connection in the place where you would use AliMind?",
    type: "singleSelect",
    options: ["Very reliable (rarely have connectivity issues)", "Somewhat reliable (occasional issues)", "Unreliable (frequent issues)"],
  },
  {
    id: "pilot-additional-69",
    number: 69,
    prompt: "Have you used a health or nutrition app before?",
    type: "singleSelect",
    options: ["Yes", "No"],
    followUp: "If yes, which app or apps have you used?",
  },
  {
    id: "pilot-additional-70",
    number: 70,
    prompt: "Do any dietary needs or restrictions affect which meals you can eat? Select all that apply.",
    type: "multiSelect",
    options: ["None", "Food allergy or intolerance", "Vegetarian", "Vegan", "Religious dietary restriction", "Medical diet", "Other"],
    followUp: "If applicable, please specify.",
  },
  {
    id: "pilot-additional-71",
    number: 71,
    prompt: "What cooking facilities are available where you live?",
    type: "singleSelect",
    options: ["Full kitchen", "Limited cooking facilities (such as a rice cooker, hot plate, or electric kettle)", "Shared kitchen", "No cooking facilities"],
  },
  {
    id: "pilot-additional-72",
    number: 72,
    prompt: "How often do you prepare or cook meals for yourself?",
    type: "singleSelect",
    options: ["Daily", "4–6 times per week", "2–3 times per week", "Once a week or less", "Never"],
  },
];

export const PILOT_SURVEY_SECTIONS: PilotSurveySection[] = [
  { id: "tpb", title: "Part A: TPB Questions", questions: PILOT_TPB_QUESTIONS },
  { id: "ttm", title: "Part B: Stage of Change", questions: PILOT_TTM_QUESTIONS },
  { id: "additional", title: "Part C: Additional Questions", questions: PILOT_ADDITIONAL_QUESTIONS },
];
