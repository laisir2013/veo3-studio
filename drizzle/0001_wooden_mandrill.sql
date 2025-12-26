CREATE TABLE `api_key_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyIndex` int NOT NULL,
	`usedAt` timestamp NOT NULL DEFAULT (now()),
	`endpoint` varchar(128),
	`success` int DEFAULT 1,
	CONSTRAINT `api_key_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `video_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`mode` enum('fast','quality') NOT NULL,
	`videoModel` varchar(64) NOT NULL,
	`llmModel` varchar(64) NOT NULL,
	`story` text NOT NULL,
	`characterDescription` text,
	`visualStyle` text,
	`status` enum('pending','analyzing','generating_images','generating_videos','generating_audio','merging','completed','failed') NOT NULL DEFAULT 'pending',
	`progress` int NOT NULL DEFAULT 0,
	`currentStep` varchar(128),
	`scenes` json,
	`characterImageUrl` text,
	`finalVideoUrl` text,
	`thumbnailUrl` text,
	`totalScenes` int DEFAULT 0,
	`completedScenes` int DEFAULT 0,
	`duration` int,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `video_tasks_id` PRIMARY KEY(`id`)
);
