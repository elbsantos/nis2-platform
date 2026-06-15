/**
 * server/services/course-config.test.ts
 *
 * Unit tests for the NIS2 course configuration and lesson registry.
 */

import { describe, it, expect } from "vitest";
import {
  courseModules,
  getAllLessons,
  getLessonById,
  getModuleById,
} from "./course-config";

// ---------------------------------------------------------------------------
// courseModules
// ---------------------------------------------------------------------------

describe("courseModules", () => {
  it("contains exactly 2 modules", () => {
    expect(courseModules).toHaveLength(2);
  });

  it("modules are ordered: module-1 first, module-2 second", () => {
    const [m1, m2] = courseModules;
    expect(m1.id).toBe("module-1");
    expect(m2.id).toBe("module-2");
  });

  it("every lesson has a unique id", () => {
    const ids = getAllLessons().map((l) => l.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// getAllLessons
// ---------------------------------------------------------------------------

describe("getAllLessons", () => {
  it("returns 7 lessons total", () => {
    expect(getAllLessons()).toHaveLength(7);
  });

  it("module-1 has 4 lessons", () => {
    const m1lessons = getAllLessons().filter((l) => l.moduleId === "module-1");
    expect(m1lessons).toHaveLength(4);
  });

  it("module-2 has 3 lessons", () => {
    const m2lessons = getAllLessons().filter((l) => l.moduleId === "module-2");
    expect(m2lessons).toHaveLength(3);
  });

  it("every lesson has title, description and positive duration", () => {
    for (const lesson of getAllLessons()) {
      expect(lesson.title.length).toBeGreaterThan(0);
      expect(lesson.description.length).toBeGreaterThan(0);
      expect(lesson.durationMinutes).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getLessonById
// ---------------------------------------------------------------------------

describe("getLessonById", () => {
  it("finds module-1 lessons by their ID", () => {
    const lesson = getLessonById("module-1/lesson-1-1");
    expect(lesson).toBeDefined();
    expect(lesson!.moduleId).toBe("module-1");
  });

  it("finds module-2 lessons by their ID", () => {
    const lesson = getLessonById("module-2/lesson-2-1");
    expect(lesson).toBeDefined();
    expect(lesson!.moduleId).toBe("module-2");
  });

  it("returns undefined for unknown ID", () => {
    expect(getLessonById("does-not-exist")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Quiz structure
// ---------------------------------------------------------------------------

describe("quiz structure", () => {
  it("every lesson has exactly 5 quiz questions", () => {
    for (const lesson of getAllLessons()) {
      expect(lesson.quiz).toHaveLength(5);
    }
  });

  it("every quiz question has 4 options", () => {
    for (const lesson of getAllLessons()) {
      for (const q of lesson.quiz) {
        expect(q.options).toHaveLength(4);
      }
    }
  });

  it("every correct index is between 0 and 3", () => {
    for (const lesson of getAllLessons()) {
      for (const q of lesson.quiz) {
        expect(q.correct).toBeGreaterThanOrEqual(0);
        expect(q.correct).toBeLessThanOrEqual(3);
      }
    }
  });

  it("every question has a non-empty explanation", () => {
    for (const lesson of getAllLessons()) {
      for (const q of lesson.quiz) {
        expect(q.explanation.length).toBeGreaterThan(0);
      }
    }
  });

  it("question IDs are unique within each lesson", () => {
    for (const lesson of getAllLessons()) {
      const ids = lesson.quiz.map((q) => q.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    }
  });
});

// ---------------------------------------------------------------------------
// getModuleById
// ---------------------------------------------------------------------------

describe("getModuleById", () => {
  it("finds module-1", () => {
    const m = getModuleById("module-1");
    expect(m).toBeDefined();
    expect(m!.id).toBe("module-1");
  });

  it("returns undefined for unknown module", () => {
    expect(getModuleById("module-99")).toBeUndefined();
  });
});
