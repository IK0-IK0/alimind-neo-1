export const TPB_INFERENCE_MODEL = {
  id: "bert-base-uncased",
  modelCardUrl: "https://huggingface.co/google-bert/bert-base-uncased",
  architectureDocsUrl: "https://huggingface.co/docs/transformers/en/model_doc/bert",
  classificationDocsUrl: "https://huggingface.co/docs/transformers/en/tasks/sequence_classification",
  pretrainedTask: "fill-mask",
  targetTask: "Encode Q1 responses and train a temporary Ridge scoring head using synthetic examples.",
  scoreRange: "1–7",
  runtime: "local Python / PyTorch / Transformers",
} as const;
