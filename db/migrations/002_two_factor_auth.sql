-- Migración manual (ver db/README.md): agrega soporte de 2FA (TOTP) a
-- iam-service. Feature nueva de cero -- v1 tampoco tenía 2FA, así que no
-- hay tabla ni columna legada que preservar acá.
--
-- Decisiones (con visto bueno explícito del usuario, ver docs/02-roadmap.md):
--  - TUserTwoFactor.Secret queda en texto plano (no se puede hashear, hace
--    falta el valor original para generar/comparar códigos; cifrarlo exigiría
--    gestión de una clave de aplicación nueva, fuera de alcance por ahora).
--  - TUserTwoFactor.IndEnabled es un booleano simple, NO usa el motor de
--    estados genérico (IdeState/SState): esto no es una entidad de negocio
--    con transiciones configurables vía SStateRule, es una bandera interna
--    de "¿ya confirmó el enrolamiento?" -- usar el motor completo acá sería
--    forzar un patrón donde no aporta nada.
--  - Los códigos de respaldo (TUserBackupCode) sí se guardan hasheados
--    (bcrypt, igual que TUserCredential.Credential) porque solo hace falta
--    compararlos, nunca recuperarlos.

CREATE TABLE ars_platform."TUserTwoFactor" (
	"IdeUserTwoFactor" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeUser" uuid NOT NULL,
	"Secret" varchar(64) NOT NULL,
	"IndEnabled" bool DEFAULT false NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TUserTwoFactor" PRIMARY KEY ("IdeUserTwoFactor"),
	CONSTRAINT "UK_TUserTwoFactor_01" UNIQUE ("IdeUser")
);
CREATE INDEX "IX_TUserTwoFactor_TUser" ON ars_platform."TUserTwoFactor" USING btree ("IdeUser");

CREATE TABLE ars_platform."TUserBackupCode" (
	"IdeUserBackupCode" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeUser" uuid NOT NULL,
	"CodeHash" varchar(250) NOT NULL,
	"IndUsed" bool DEFAULT false NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TUserBackupCode" PRIMARY KEY ("IdeUserBackupCode")
);
CREATE INDEX "IX_TUserBackupCode_TUser" ON ars_platform."TUserBackupCode" USING btree ("IdeUser");

ALTER TABLE ars_platform."TUserTwoFactor" ADD CONSTRAINT "FK_TUserTwoFactor_TUser" FOREIGN KEY ("IdeUser") REFERENCES ars_platform."TUser"("IdeUser");
ALTER TABLE ars_platform."TUserBackupCode" ADD CONSTRAINT "FK_TUserBackupCode_TUser" FOREIGN KEY ("IdeUser") REFERENCES ars_platform."TUser"("IdeUser");
