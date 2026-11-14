CREATE TABLE `deviceCode` (
	`id` text PRIMARY KEY NOT NULL,
	`deviceCode` text NOT NULL,
	`userCode` text NOT NULL,
	`userId` text,
	`expiresAt` date NOT NULL,
	`status` text NOT NULL,
	`lastPolledAt` date,
	`pollingInterval` integer,
	`clientId` text,
	`scope` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deviceCode_deviceCode_unique` ON `deviceCode` (`deviceCode`);--> statement-breakpoint
CREATE UNIQUE INDEX `deviceCode_userCode_unique` ON `deviceCode` (`userCode`);
