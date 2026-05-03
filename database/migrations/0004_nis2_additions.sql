-- Migration: NIS2 MVP additions
-- Run with: drizzle-kit migrate
-- Date: 2025-04

-- 1. Subscriptions table (billing tier per org)
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id`                INT          NOT NULL AUTO_INCREMENT,
  `organizationId`    INT          NOT NULL,
  `plan`              ENUM('free','pro','mssp') NOT NULL DEFAULT 'free',
  `stripeCustomerId`  VARCHAR(255) NULL,
  `stripeSubId`       VARCHAR(255) NULL,
  `currentPeriodEnd`  TIMESTAMP    NULL,
  `cancelAt`          TIMESTAMP    NULL,
  `createdAt`         TIMESTAMP    NOT NULL DEFAULT NOW(),
  `updatedAt`         TIMESTAMP    NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_org` (`organizationId`),
  INDEX `idx_stripe_sub` (`stripeSubId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Questionnaire sessions (NIS2 adaptive questionnaire)
CREATE TABLE IF NOT EXISTS `questionnaire_sessions` (
  `id`            INT           NOT NULL AUTO_INCREMENT,
  `organizationId`INT           NOT NULL,
  `userId`        INT           NOT NULL,
  `sector`        VARCHAR(100)  NULL,
  `answers`       JSON          NULL COMMENT 'Array of {controlId, answer, score}',
  `score`         DECIMAL(5,2)  NULL COMMENT 'Overall NIS2 score 0-100',
  `articleScores` JSON          NULL COMMENT 'Score per NIS2 article',
  `status`        ENUM('in_progress','completed') NOT NULL DEFAULT 'in_progress',
  `completedAt`   TIMESTAMP     NULL,
  `createdAt`     TIMESTAMP     NOT NULL DEFAULT NOW(),
  `updatedAt`     TIMESTAMP     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  PRIMARY KEY (`id`),
  INDEX `idx_org` (`organizationId`),
  INDEX `idx_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Remediation items (per vulnerability, per org)
CREATE TABLE IF NOT EXISTS `remediation_items` (
  `id`            INT           NOT NULL AUTO_INCREMENT,
  `organizationId`INT           NOT NULL,
  `scanId`        INT           NULL,
  `vulnId`        INT           NULL,
  `title`         VARCHAR(500)  NOT NULL,
  `steps`         JSON          NULL COMMENT 'Array of {order, instruction, platform}',
  `effort`        ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  `status`        ENUM('todo','in_progress','done','wont_fix') NOT NULL DEFAULT 'todo',
  `nis2Articles`  JSON          NULL COMMENT 'Array of article refs e.g. ["Art. 21(2)(h)"]',
  `dueDate`       DATE          NULL,
  `resolvedAt`    TIMESTAMP     NULL,
  `createdAt`     TIMESTAMP     NOT NULL DEFAULT NOW(),
  `updatedAt`     TIMESTAMP     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  PRIMARY KEY (`id`),
  INDEX `idx_org_status` (`organizationId`, `status`),
  INDEX `idx_scan` (`scanId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Course progress (per user, per lesson)
CREATE TABLE IF NOT EXISTS `course_progress` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `userId`         INT          NOT NULL,
  `organizationId` INT          NOT NULL,
  `moduleId`       VARCHAR(50)  NOT NULL COMMENT 'e.g. "module-1"',
  `lessonId`       VARCHAR(50)  NOT NULL COMMENT 'e.g. "lesson-1-2"',
  `completedAt`    TIMESTAMP    NOT NULL DEFAULT NOW(),
  `certificateUrl` VARCHAR(500) NULL COMMENT 'S3 URL of generated PDF certificate',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_lesson` (`userId`, `lessonId`),
  INDEX `idx_user_module` (`userId`, `moduleId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
