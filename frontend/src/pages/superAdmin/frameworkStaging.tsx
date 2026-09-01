/**
 * Staged editing for the framework page.
 *
 * Exposes the same method names and (async) signatures as `adminApi`, but every
 * call mutates an in-memory tree instead of hitting the API — so the editor's
 * modals and wizards keep their existing `await staging.createQuestion(...)`
 * shape while nothing reaches the live questionnaire until Publier.
 *
 * The tree is handed back to the page, which autosaves it to the server-side
 * draft; that's what makes a half-finished reorganisation survive a refresh,
 * an expired session or a closed tab.
 */

import { createContext, useContext } from "react";
import type {
  Dimension,
  Question,
  QuestionInput,
  SubDimension,
  SubDimensionInput,
  DimensionInput,
  Status,
} from "@/lib/admin";

// crypto.randomUUID() (standard Web Crypto API, no import needed) instead of
// a module-level counter: the counter reset to 0 on every page load, which
// could collide with a "new-q-1" already sitting in the persisted draft --
// harmless before, but this id is now also the durable cross-reference a
// draft recommendation uses to point at its (not-yet-published) question,
// so it has to be genuinely unique, not just unique-per-session.
const newId = (prefix: string) => `new-${prefix}-${crypto.randomUUID()}`;

const active = (status?: Status) => (status === "Inactive" ? "Inactive" : "Active");

export interface StagingApi {
  createDimension(input: DimensionInput): Promise<{ id: string }>;
  updateDimension(id: string, input: Partial<DimensionInput>): Promise<void>;
  deleteDimension(id: string): Promise<void>;
  createSubDimension(dimensionId: string, input: SubDimensionInput): Promise<{ id: string }>;
  updateSubDimension(id: string, input: Partial<SubDimensionInput>): Promise<void>;
  deleteSubDimension(id: string): Promise<void>;
  createQuestion(subDimensionId: string, input: QuestionInput): Promise<{ id: string }>;
  updateQuestion(id: string, input: Partial<QuestionInput>): Promise<void>;
  deleteQuestion(id: string): Promise<void>;
}

/** Builds the staging API over a React state setter. */
export function createStaging(
  update: (mutate: (dimensions: Dimension[]) => Dimension[]) => void,
): StagingApi {
  const mapQuestions = (
    dimensions: Dimension[],
    fn: (question: Question, sub: SubDimension, dimension: Dimension) => Question,
  ) =>
    dimensions.map(dimension => ({
      ...dimension,
      subDimensions: dimension.subDimensions.map(sub => ({
        ...sub,
        questions: sub.questions.map(question => fn(question, sub, dimension)),
      })),
    }));

  return {
    async createDimension(input) {
      const id = newId("dim");
      update(dimensions => [
        ...dimensions,
        {
          id,
          name: input.name,
          description: input.description ?? "",
          weight: input.weight ?? 0,
          color: input.color ?? "#1A1A1A",
          status: active(input.status),
          subDimensions: [],
        },
      ]);
      return { id };
    },

    async updateDimension(id, input) {
      update(dimensions =>
        dimensions.map(dimension =>
          dimension.id === id
            ? {
                ...dimension,
                ...(input.name !== undefined && { name: input.name }),
                ...(input.description !== undefined && { description: input.description }),
                ...(input.weight !== undefined && { weight: input.weight }),
                ...(input.color !== undefined && { color: input.color }),
                ...(input.status !== undefined && { status: active(input.status) }),
              }
            : dimension,
        ),
      );
    },

    async deleteDimension(id) {
      update(dimensions => dimensions.filter(dimension => dimension.id !== id));
    },

    async createSubDimension(dimensionId, input) {
      const id = newId("sub");
      update(dimensions =>
        dimensions.map(dimension =>
          dimension.id === dimensionId
            ? {
                ...dimension,
                subDimensions: [
                  ...dimension.subDimensions,
                  { id, name: input.name, status: active(input.status), questions: [] },
                ],
              }
            : dimension,
        ),
      );
      return { id };
    },

    async updateSubDimension(id, input) {
      update(dimensions =>
        dimensions.map(dimension => ({
          ...dimension,
          subDimensions: dimension.subDimensions.map(sub =>
            sub.id === id
              ? {
                  ...sub,
                  ...(input.name !== undefined && { name: input.name }),
                  ...(input.status !== undefined && { status: active(input.status) }),
                }
              : sub,
          ),
        })),
      );
    },

    async deleteSubDimension(id) {
      update(dimensions =>
        dimensions.map(dimension => ({
          ...dimension,
          subDimensions: dimension.subDimensions.filter(sub => sub.id !== id),
        })),
      );
    },

    async createQuestion(subDimensionId, input) {
      const id = newId("q");
      update(dimensions =>
        dimensions.map(dimension => ({
          ...dimension,
          subDimensions: dimension.subDimensions.map(sub =>
            sub.id === subDimensionId
              ? {
                  ...sub,
                  questions: [
                    ...sub.questions,
                    {
                      id,
                      dimensionId: dimension.id,
                      subDimensionId: sub.id,
                      label: input.label,
                      description: input.description ?? "",
                      type: input.type ?? "Échelle de maturité",
                      weight: input.weight ?? 0,
                      order: sub.questions.length,
                      isRequired: input.isRequired ?? true,
                      levelResponses: input.levelResponses ?? null,
                      choiceOptions: input.choiceOptions ?? null,
                      status: active(input.status),
                    },
                  ],
                }
              : sub,
          ),
        })),
      );
      return { id };
    },

    async updateQuestion(id, input) {
      update(dimensions => {
        // A move is modelled as remove-then-insert so the question ends up in
        // exactly one sub-dimension, whichever tree branch it started in.
        const target = input.subDimensionId;
        let moved: Question | null = null;

        const patched = mapQuestions(dimensions, question => {
          if (question.id !== id) return question;
          const next: Question = {
            ...question,
            ...(input.label !== undefined && { label: input.label }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.type !== undefined && { type: input.type }),
            ...(input.weight !== undefined && { weight: input.weight }),
            ...(input.order !== undefined && { order: input.order }),
            ...(input.isRequired !== undefined && { isRequired: input.isRequired }),
            ...(input.levelResponses !== undefined && { levelResponses: input.levelResponses }),
            ...(input.choiceOptions !== undefined && { choiceOptions: input.choiceOptions }),
            ...(input.status !== undefined && { status: active(input.status) }),
          };
          moved = next;
          return next;
        });

        if (!target || moved === null || (moved as Question).subDimensionId === target) {
          return patched;
        }

        const question = moved as Question;
        return patched.map(dimension => ({
          ...dimension,
          subDimensions: dimension.subDimensions.map(sub => {
            if (sub.id === target) {
              return {
                ...sub,
                questions: [
                  ...sub.questions.filter(q => q.id !== id),
                  { ...question, dimensionId: dimension.id, subDimensionId: target },
                ],
              };
            }
            return { ...sub, questions: sub.questions.filter(q => q.id !== id) };
          }),
        }));
      });
    },

    async deleteQuestion(id) {
      update(dimensions =>
        dimensions.map(dimension => ({
          ...dimension,
          subDimensions: dimension.subDimensions.map(sub => ({
            ...sub,
            questions: sub.questions.filter(question => question.id !== id),
          })),
        })),
      );
    },
  };
}

const StagingContext = createContext<StagingApi | null>(null);

export const StagingProvider = StagingContext.Provider;

export function useStaging(): StagingApi {
  const staging = useContext(StagingContext);
  if (!staging) throw new Error("useStaging must be used inside a StagingProvider");
  return staging;
}
