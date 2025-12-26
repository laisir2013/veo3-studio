CREATE TABLE `character_voices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`characterName` varchar(128) NOT NULL,
	`characterDescription` text,
	`characterImageUrl` text,
	`voiceActorId` varchar(64) NOT NULL,
	`isAutoMatched` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `character_voices_id` PRIMARY KEY(`id`)
);
