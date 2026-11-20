export type TpbConstruct = "attitude" | "subjectiveNorm" | "perceivedControl" | "intention";

export interface TpbFreeTextQuestion {
  id: string;
  number: number;
  prompt: string;
  responsePrompt: string;
  sourceScale: {
    low: string;
    high: string;
  };
}

export interface TpbFreeTextSection {
  id: string;
  title: string;
  construct: TpbConstruct;
  questions: TpbFreeTextQuestion[];
}

const question = (
  id: string,
  number: number,
  prompt: string,
  low: string,
  high: string,
): TpbFreeTextQuestion => ({
  id,
  number,
  prompt,
  responsePrompt: "Tell us what makes you feel this way.",
  sourceScale: { low, high },
});

export const TPB_FREE_TEXT_SECTIONS: TpbFreeTextSection[] = [
  {
    id: "behavioral-beliefs-attitude",
    title: "Section 1: Behavioral Beliefs (Attitude)",
    construct: "attitude",
    questions: [
      question("tpb-01", 1, "Eating nutritious meals daily for the next month would help me maintain good overall health.", "Extremely unlikely", "Extremely likely"),
      question("tpb-02", 2, "Having nutritious meals every day for the next month would provide important health benefits for my body.", "Extremely unlikely", "Extremely likely"),
      question("tpb-03", 3, "Choosing nutritious meals daily would be valuable in meeting my body's nutritional needs.", "Extremely unlikely", "Extremely likely"),
      question("tpb-04", 4, "Eating nutritious meals throughout the next month would make my overall eating experience more enjoyable.", "Extremely unlikely", "Extremely likely"),
      question("tpb-05", 5, "Consistently choosing nutritious meals would leave me feeling satisfied with my food choices.", "Extremely unlikely", "Extremely likely"),
    ],
  },
  {
    id: "behavioral-beliefs-outcomes",
    title: "Section 2: What You Think Would Happen (Behavioral Beliefs)",
    construct: "attitude",
    questions: [
      question("tpb-06", 6, "Eating nutritious meals daily for the next month would improve my health.", "Extremely unlikely", "Extremely likely"),
      question("tpb-07", 7, "Eating nutritious meals daily for the next month would give me more energy.", "Extremely unlikely", "Extremely likely"),
      question("tpb-08", 8, "Eating nutritious meals daily for the next month would be time-consuming.", "Extremely unlikely", "Extremely likely"),
      question("tpb-09", 9, "Eating nutritious meals daily for the next month would be expensive.", "Extremely unlikely", "Extremely likely"),
    ],
  },
  {
    id: "outcome-evaluation",
    title: "Section 3: How You Value Those Outcomes (Outcome Evaluation)",
    construct: "attitude",
    questions: [
      question("tpb-10", 10, "Improving my health is:", "Extremely bad", "Extremely good"),
      question("tpb-11", 11, "Having more energy is:", "Extremely bad", "Extremely good"),
      question("tpb-12", 12, "Spending time on meal preparation is:", "Extremely bad", "Extremely good"),
      question("tpb-13", 13, "Spending money on food is:", "Extremely bad", "Extremely good"),
    ],
  },
  {
    id: "subjective-norm",
    title: "Section 4: What Others Think & Do (Subjective Norm)",
    construct: "subjectiveNorm",
    questions: [
      question("tpb-14", 14, "Most people who are important to me think I should eat nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
      question("tpb-15", 15, "Most people who are important to me would approve of me eating nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
      question("tpb-16", 16, "It is expected of me that I eat nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
      question("tpb-17", 17, "Most people like me eat nutritious meals daily.", "Strongly disagree", "Strongly agree"),
    ],
  },
  {
    id: "normative-beliefs",
    title: "Section 5: What Specific People Think (Normative Beliefs)",
    construct: "subjectiveNorm",
    questions: [
      question("tpb-18", 18, "My family thinks I should eat nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
      question("tpb-19", 19, "My friends think I should eat nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
      question("tpb-20", 20, "Health professionals think I should eat nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
    ],
  },
  {
    id: "motivation-to-comply",
    title: "Section 6: How Much You Care About Their Opinions (Motivation to Comply)",
    construct: "subjectiveNorm",
    questions: [
      question("tpb-21", 21, "When it comes to matters of health and diet, I want to do what my family thinks I should do.", "Strongly disagree", "Strongly agree"),
      question("tpb-22", 22, "When it comes to matters of health and diet, I want to do what my friends think I should do.", "Strongly disagree", "Strongly agree"),
      question("tpb-23", 23, "When it comes to matters of health and diet, I want to do what health professionals think I should do.", "Strongly disagree", "Strongly agree"),
    ],
  },
  {
    id: "perceived-behavioral-control",
    title: "Section 7: How Much Control You Feel You Have (Perceived Behavioral Control)",
    construct: "perceivedControl",
    questions: [
      question("tpb-24", 24, "For me, eating nutritious meals daily for the next month would be:", "Extremely difficult", "Extremely easy"),
      question("tpb-25", 25, "If I wanted to, I could eat nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
      question("tpb-26", 26, "How much control do you have over eating nutritious meals daily for the next month?", "No control", "Complete control"),
      question("tpb-27", 27, "It is mostly up to me whether or not I eat nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
    ],
  },
  {
    id: "control-beliefs",
    title: "Section 8: Factors That Help or Hinder You (Control Beliefs)",
    construct: "perceivedControl",
    questions: [
      question("tpb-28", 28, "Having access to cooking facilities would enable me to eat nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
      question("tpb-29", 29, "Having enough money for groceries would enable me to eat nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
      question("tpb-30", 30, "Having enough time would enable me to eat nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
      question("tpb-31", 31, "Having cooking skills would enable me to eat nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
    ],
  },
  {
    id: "perceived-power",
    title: "Section 9: How Easy It Is to Have These Enablers (Perceived Power)",
    construct: "perceivedControl",
    questions: [
      question("tpb-32", 32, "Having access to cooking facilities would make it easier for me to eat nutritious meals daily.", "Extremely difficult", "Extremely easy"),
      question("tpb-33", 33, "Having enough money to purchase nutritious groceries would make eating nutritious meals daily:", "Extremely difficult", "Extremely easy"),
      question("tpb-34", 34, "Having enough time to prepare or obtain nutritious meals would make eating nutritious meals daily:", "Extremely difficult", "Extremely easy"),
      question("tpb-35", 35, "Having the necessary cooking skills would make preparing nutritious meals:", "Extremely difficult", "Extremely easy"),
    ],
  },
  {
    id: "intentions",
    title: "Section 10: Your Plans and Intentions",
    construct: "intention",
    questions: [
      question("tpb-36", 36, "I am committed to eating nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
      question("tpb-37", 37, "I am willing to make the necessary effort to eat nutritious meals daily for the next month.", "Strongly disagree", "Strongly agree"),
      question("tpb-38", 38, "How likely are you to eat nutritious meals daily for the next month?", "Definitely do not", "Definitely do"),
    ],
  },
];

export const TPB_FREE_TEXT_QUESTION_COUNT = TPB_FREE_TEXT_SECTIONS.reduce(
  (count, section) => count + section.questions.length,
  0,
);
