-- Migración inicial: esquema ars_platform (aislado de "entity", que sigue usando la v1)
-- Generado a partir del DDL de 130 tablas provisto (BD.rtf), con el esquema renombrado de entity -> ars_platform.

CREATE SCHEMA IF NOT EXISTS ars_platform;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ars_platform."TDocument" definition

-- Drop table

-- DROP TABLE ars_platform."TDocument";

CREATE TABLE ars_platform."TDocument" (
	"IdeDocument" uuid DEFAULT uuid_generate_v4() NOT NULL,
	"EntityKind" varchar(50) NULL,
	"IdeEntity" varchar(50) NULL,
	"CodCategory" varchar(100) NOT NULL,
	"IsGenerated" bool DEFAULT false NULL,
	"ContextData" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"FileInfo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"StoragePath" text NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "TDocument_pkey" PRIMARY KEY ("IdeDocument")
);
CREATE INDEX idx_documents_category ON ars_platform."TDocument" USING btree ("CodCategory");
CREATE INDEX idx_documents_context_data ON ars_platform."TDocument" USING gin ("ContextData");
CREATE INDEX idx_documents_entity_lookup ON ars_platform."TDocument" USING btree ("EntityKind", "IdeEntity");


-- ars_platform."SAccessConnection" definition

-- Drop table

-- DROP TABLE ars_platform."SAccessConnection";

CREATE TABLE ars_platform."SAccessConnection" (
	"IdeAccessConnection" uuid DEFAULT gen_random_uuid() NOT NULL,
	"AccessConnectionOrigin" uuid NOT NULL,
	"AccessConnectionData" varchar NOT NULL,
	"AccessConnectionCode" varchar(60) NOT NULL,
	"AccessConnectionKey" varchar NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SAccessConnection" PRIMARY KEY ("IdeAccessConnection"),
	CONSTRAINT "UK_SAccessConnection_01" UNIQUE ("AccessConnectionOrigin")
);
CREATE INDEX "IX_SAccessConnection_SState" ON ars_platform."SAccessConnection" USING btree ("IdeState");


-- ars_platform."SApplication" definition

-- Drop table

-- DROP TABLE ars_platform."SApplication";

CREATE TABLE ars_platform."SApplication" (
	"IdeApplication" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodApplication" varchar(30) NOT NULL,
	"DesApplication" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SApplication" PRIMARY KEY ("IdeApplication"),
	CONSTRAINT "UK_SApplication_01" UNIQUE ("CodApplication")
);
CREATE INDEX "IX_SApplication_SState" ON ars_platform."SApplication" USING btree ("IdeState");
CREATE INDEX "IX_SApplication_STextContent" ON ars_platform."SApplication" USING btree ("IdeTextContent");


-- ars_platform."SApplicationRole" definition

-- Drop table

-- DROP TABLE ars_platform."SApplicationRole";

CREATE TABLE ars_platform."SApplicationRole" (
	"IdeApplicationRole" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodApplicationRole" varchar(30) NOT NULL,
	"DesApplicationRole" varchar(200) NOT NULL,
	"IdeApplication" uuid NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SApplicationRole" PRIMARY KEY ("IdeApplicationRole"),
	CONSTRAINT "UK_SApplicationRole_01" UNIQUE ("CodApplicationRole")
);
CREATE INDEX "IX_SApplicationRole_SApplication" ON ars_platform."SApplicationRole" USING btree ("IdeApplication");
CREATE INDEX "IX_SApplicationRole_SState" ON ars_platform."SApplicationRole" USING btree ("IdeState");
CREATE INDEX "IX_SApplicationRole_STextContent" ON ars_platform."SApplicationRole" USING btree ("IdeTextContent");


-- ars_platform."SAttribute" definition

-- Drop table

-- DROP TABLE ars_platform."SAttribute";

CREATE TABLE ars_platform."SAttribute" (
	"IdeAttribute" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodAttribute" varchar(200) NOT NULL,
	"DesAttribute" varchar(200) NOT NULL,
	"AttributeContent" varchar NOT NULL,
	"IdeFieldDictionary" uuid NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SAttribute" PRIMARY KEY ("IdeAttribute"),
	CONSTRAINT "UK_SAttribute_01" UNIQUE ("CodAttribute")
);
CREATE INDEX "IX_SAttribute_SFieldDictionary" ON ars_platform."SAttribute" USING btree ("IdeFieldDictionary");
CREATE INDEX "IX_SAttribute_SState" ON ars_platform."SAttribute" USING btree ("IdeState");
CREATE INDEX "IX_SAttribute_STextContent" ON ars_platform."SAttribute" USING btree ("IdeTextContent");


-- ars_platform."SAttributeProperty" definition

-- Drop table

-- DROP TABLE ars_platform."SAttributeProperty";

CREATE TABLE ars_platform."SAttributeProperty" (
	"IdeAttributeProperty" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodAttributeProperty" varchar(200) NOT NULL,
	"DesAttributeProperty" varchar(200) NOT NULL,
	"IdeModelAttribute" uuid NOT NULL,
	"IdeAttribute" uuid NOT NULL,
	"AttributeContent" varchar NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SAttributeProperty" PRIMARY KEY ("IdeAttributeProperty"),
	CONSTRAINT "UK_SAttributeProperty_01" UNIQUE ("CodAttributeProperty")
);
CREATE INDEX "IX_SAttributeProperty_SAttribute" ON ars_platform."SAttributeProperty" USING btree ("IdeAttribute");
CREATE INDEX "IX_SAttributeProperty_SModelAttribute" ON ars_platform."SAttributeProperty" USING btree ("IdeModelAttribute");
CREATE INDEX "IX_SAttributeProperty_SState" ON ars_platform."SAttributeProperty" USING btree ("IdeState");
CREATE INDEX "IX_SAttributeProperty_STextContent" ON ars_platform."SAttributeProperty" USING btree ("IdeTextContent");


-- ars_platform."SBrokerType" definition

-- Drop table

-- DROP TABLE ars_platform."SBrokerType";

CREATE TABLE ars_platform."SBrokerType" (
	"IdeBrokerType" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodBrokerType" varchar(30) NOT NULL,
	"DesBrokerType" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SBrokerType" PRIMARY KEY ("IdeBrokerType"),
	CONSTRAINT "UK_SBrokerType_01" UNIQUE ("CodBrokerType")
);
CREATE INDEX "IX_SBrokerType_SState" ON ars_platform."SBrokerType" USING btree ("IdeState");
CREATE INDEX "IX_SBrokerType_STextContent" ON ars_platform."SBrokerType" USING btree ("IdeTextContent");


-- ars_platform."SBusinessActivity" definition

-- Drop table

-- DROP TABLE ars_platform."SBusinessActivity";

CREATE TABLE ars_platform."SBusinessActivity" (
	"IdeBusinessActivity" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodBusinessActivity" varchar(30) NOT NULL,
	"DesBusinessActivity" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SBusinessActivity" PRIMARY KEY ("IdeBusinessActivity"),
	CONSTRAINT "UK_SBusinessActivity_01" UNIQUE ("CodBusinessActivity")
);
CREATE INDEX "IX_SBusinessActivity_SState" ON ars_platform."SBusinessActivity" USING btree ("IdeState");
CREATE INDEX "IX_SBusinessActivity_STextContent" ON ars_platform."SBusinessActivity" USING btree ("IdeTextContent");


-- ars_platform."SCalculationRule" definition

-- Drop table

-- DROP TABLE ars_platform."SCalculationRule";

CREATE TABLE ars_platform."SCalculationRule" (
	"IdeCalculationRule" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodCalculationRule" varchar(30) NOT NULL,
	"DesCalculationRule" varchar(200) NOT NULL,
	"IdeProduct" uuid NULL,
	"IdePlanProductRisk" uuid NULL,
	"IdeCoveragePlan" uuid NOT NULL,
	"IdeConcept" uuid NOT NULL,
	"Order" int4 NOT NULL,
	"CodEntityReference" varchar(30) NULL,
	"DesColumnName" varchar NULL,
	"FormulaJSON" json NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SCalculationRule" PRIMARY KEY ("IdeCalculationRule"),
	CONSTRAINT "UK_SCalculationRule_01" UNIQUE ("CodCalculationRule")
);
CREATE INDEX "IX_SCalculationRule_SConcept" ON ars_platform."SCalculationRule" USING btree ("IdeConcept");
CREATE INDEX "IX_SCalculationRule_SCoveragePlan" ON ars_platform."SCalculationRule" USING btree ("IdeCoveragePlan");
CREATE INDEX "IX_SCalculationRule_SEntity" ON ars_platform."SCalculationRule" USING btree ("CodEntityReference");
CREATE INDEX "IX_SCalculationRule_SPlanProductRisk" ON ars_platform."SCalculationRule" USING btree ("IdePlanProductRisk");
CREATE INDEX "IX_SCalculationRule_SProduct" ON ars_platform."SCalculationRule" USING btree ("IdeProduct");
CREATE INDEX "IX_SCalculationRule_SState" ON ars_platform."SCalculationRule" USING btree ("IdeState");
CREATE INDEX "IX_SCalculationRule_STextContent" ON ars_platform."SCalculationRule" USING btree ("IdeTextContent");


-- ars_platform."SChannelType" definition

-- Drop table

-- DROP TABLE ars_platform."SChannelType";

CREATE TABLE ars_platform."SChannelType" (
	"IdeChannelType" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodChannelType" varchar(30) NOT NULL,
	"DesChannelType" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SChannelType" PRIMARY KEY ("IdeChannelType"),
	CONSTRAINT "UK_SChannelType_01" UNIQUE ("CodChannelType")
);
CREATE INDEX "IX_SChannelType_SState" ON ars_platform."SChannelType" USING btree ("IdeState");
CREATE INDEX "IX_SChannelType_STextContent" ON ars_platform."SChannelType" USING btree ("IdeTextContent");


-- ars_platform."SClaimEvent" definition

-- Drop table

-- DROP TABLE ars_platform."SClaimEvent";

CREATE TABLE ars_platform."SClaimEvent" (
	"IdeClaimEvent" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodClaimEvent" varchar(30) NOT NULL,
	"DesClaimEvent" varchar(200) NOT NULL,
	"IdeClaimType" uuid NOT NULL,
	"DesShort" varchar(150) NULL,
	"DesLarge" varchar NULL,
	"Order" int4 NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SClaimEvent" PRIMARY KEY ("IdeClaimEvent"),
	CONSTRAINT "UK_SClaimEvent_01" UNIQUE ("CodClaimEvent")
);
CREATE INDEX "IX_SClaimEvent_SClaimType" ON ars_platform."SClaimEvent" USING btree ("IdeClaimType");
CREATE INDEX "IX_SClaimEvent_SState" ON ars_platform."SClaimEvent" USING btree ("IdeState");
CREATE INDEX "IX_SClaimEvent_STextContent" ON ars_platform."SClaimEvent" USING btree ("IdeTextContent");


-- ars_platform."SClaimType" definition

-- Drop table

-- DROP TABLE ars_platform."SClaimType";

CREATE TABLE ars_platform."SClaimType" (
	"IdeClaimType" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodClaimType" varchar(30) NOT NULL,
	"DesClaimType" varchar(200) NOT NULL,
	"IdeProduct" uuid NOT NULL,
	"IdePlanProduct" uuid NULL,
	"IdeRiskProduct" uuid NULL,
	"IdeCoverage" uuid NULL,
	"DesShort" varchar(150) NULL,
	"DesLarge" varchar NULL,
	"NumClaimsPerYear" int4 NOT NULL,
	"InitialProvisionAmount" numeric NOT NULL,
	"NumDeadLineReport" int4 NOT NULL,
	"Order" int4 NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SClaimType" PRIMARY KEY ("IdeClaimType"),
	CONSTRAINT "UK_SClaimType_01" UNIQUE ("CodClaimType")
);
CREATE INDEX "IX_SClaimType_SCoverage" ON ars_platform."SClaimType" USING btree ("IdeCoverage");
CREATE INDEX "IX_SClaimType_SPlanProduct" ON ars_platform."SClaimType" USING btree ("IdePlanProduct");
CREATE INDEX "IX_SClaimType_SProduct" ON ars_platform."SClaimType" USING btree ("IdeProduct");
CREATE INDEX "IX_SClaimType_SRiskProduct" ON ars_platform."SClaimType" USING btree ("IdeRiskProduct");
CREATE INDEX "IX_SClaimType_SState" ON ars_platform."SClaimType" USING btree ("IdeState");
CREATE INDEX "IX_SClaimType_STextContent" ON ars_platform."SClaimType" USING btree ("IdeTextContent");


-- ars_platform."SCommission" definition

-- Drop table

-- DROP TABLE ars_platform."SCommission";

CREATE TABLE ars_platform."SCommission" (
	"IdeCommission" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeCommissionTable" uuid NOT NULL,
	"IdeProcess" uuid NOT NULL,
	"Percentaje" numeric NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NOT NULL,
	"NumMovement" int4 NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SCommission" PRIMARY KEY ("IdeCommission"),
	CONSTRAINT "UK_SCommission_01" UNIQUE ("IdeCommissionTable", "IdeProcess", "NumMovement")
);
CREATE INDEX "IX_SCommission_SCommissionTable" ON ars_platform."SCommission" USING btree ("IdeCommissionTable");
CREATE INDEX "IX_SCommission_SProcess" ON ars_platform."SCommission" USING btree ("IdeProcess");
CREATE INDEX "IX_SCommission_SState" ON ars_platform."SCommission" USING btree ("IdeState");


-- ars_platform."SCommissionProduct" definition

-- Drop table

-- DROP TABLE ars_platform."SCommissionProduct";

CREATE TABLE ars_platform."SCommissionProduct" (
	"IdeCommissionProduct" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeProduct" uuid NOT NULL,
	"IdeDistributionChannelOrigin" uuid NOT NULL,
	"IdeDistributionChannelDestiny" uuid NOT NULL,
	"Percentaje" numeric NOT NULL,
	"IndMain" bool NOT NULL,
	"TstInitial" date NOT NULL,
	"TstEnd" date NOT NULL,
	"NumMovement" int4 NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SCommissionProduct" PRIMARY KEY ("IdeCommissionProduct")
);
CREATE INDEX "IX_SCommissionProduct_SDistributionChannelDestiny" ON ars_platform."SCommissionProduct" USING btree ("IdeDistributionChannelDestiny");
CREATE INDEX "IX_SCommissionProduct_SDistributionChannelOrigin" ON ars_platform."SCommissionProduct" USING btree ("IdeDistributionChannelOrigin");
CREATE INDEX "IX_SCommissionProduct_SProduct" ON ars_platform."SCommissionProduct" USING btree ("IdeProduct");
CREATE INDEX "IX_SCommissionProduct_SState" ON ars_platform."SCommissionProduct" USING btree ("IdeState");


-- ars_platform."SCommissionTable" definition

-- Drop table

-- DROP TABLE ars_platform."SCommissionTable";

CREATE TABLE ars_platform."SCommissionTable" (
	"IdeCommissionTable" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodCommissionTable" varchar(30) NOT NULL,
	"DesCommissionTable" varchar(200) NOT NULL,
	"IdeCommissionTree" uuid NOT NULL,
	"IdeProduct" uuid NOT NULL,
	"IdePlanProductRisk" uuid NULL,
	"IdeCoveragePlan" uuid NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SCommissionTable" PRIMARY KEY ("IdeCommissionTable"),
	CONSTRAINT "UK_SCommissionTable_01" UNIQUE ("CodCommissionTable")
);
CREATE INDEX "IX_SCommissionTable_SCommissionTree" ON ars_platform."SCommissionTable" USING btree ("IdeCommissionTree");
CREATE INDEX "IX_SCommissionTable_SCoveragePlan" ON ars_platform."SCommissionTable" USING btree ("IdeCoveragePlan");
CREATE INDEX "IX_SCommissionTable_SPlanProductRisk" ON ars_platform."SCommissionTable" USING btree ("IdePlanProductRisk");
CREATE INDEX "IX_SCommissionTable_SProduct" ON ars_platform."SCommissionTable" USING btree ("IdeProduct");
CREATE INDEX "IX_SCommissionTable_SState" ON ars_platform."SCommissionTable" USING btree ("IdeState");
CREATE INDEX "IX_SCommissionTable_STextContent" ON ars_platform."SCommissionTable" USING btree ("IdeTextContent");


-- ars_platform."SCommissionTree" definition

-- Drop table

-- DROP TABLE ars_platform."SCommissionTree";

CREATE TABLE ars_platform."SCommissionTree" (
	"IdeCommissionTree" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodCommissionTree" varchar(30) NOT NULL,
	"DesCommissionTree" varchar(200) NOT NULL,
	"IdeDistributionChannel" uuid NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SCommissionTree" PRIMARY KEY ("IdeCommissionTree"),
	CONSTRAINT "UK_SCommissionTree_01" UNIQUE ("CodCommissionTree")
);
CREATE INDEX "IX_SCommissionTree_SDistributionChannel" ON ars_platform."SCommissionTree" USING btree ("IdeDistributionChannel");
CREATE INDEX "IX_SCommissionTree_SState" ON ars_platform."SCommissionTree" USING btree ("IdeState");
CREATE INDEX "IX_SCommissionTree_STextContent" ON ars_platform."SCommissionTree" USING btree ("IdeTextContent");


-- ars_platform."SConcept" definition

-- Drop table

-- DROP TABLE ars_platform."SConcept";

CREATE TABLE ars_platform."SConcept" (
	"IdeConcept" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodConcept" varchar(30) NOT NULL,
	"DesConcept" varchar(200) NOT NULL,
	"IdeConceptType" uuid NOT NULL,
	"DesShort" varchar(150) NULL,
	"DesLarge" varchar NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SConcept" PRIMARY KEY ("IdeConcept"),
	CONSTRAINT "UK_SConcept_01" UNIQUE ("CodConcept")
);
CREATE INDEX "IX_SConcept_SConceptType" ON ars_platform."SConcept" USING btree ("IdeConceptType");
CREATE INDEX "IX_SConcept_SState" ON ars_platform."SConcept" USING btree ("IdeState");
CREATE INDEX "IX_SConcept_STextContent" ON ars_platform."SConcept" USING btree ("IdeTextContent");


-- ars_platform."SConceptType" definition

-- Drop table

-- DROP TABLE ars_platform."SConceptType";

CREATE TABLE ars_platform."SConceptType" (
	"IdeConceptType" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodConceptType" varchar(30) NOT NULL,
	"DesConceptType" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SConceptType" PRIMARY KEY ("IdeConceptType"),
	CONSTRAINT "UK_SConceptType_01" UNIQUE ("CodConceptType")
);
CREATE INDEX "IX_SConceptType_SState" ON ars_platform."SConceptType" USING btree ("IdeState");
CREATE INDEX "IX_SConceptType_STextContent" ON ars_platform."SConceptType" USING btree ("IdeTextContent");


-- ars_platform."SConsent" definition

-- Drop table

-- DROP TABLE ars_platform."SConsent";

CREATE TABLE ars_platform."SConsent" (
	"IdeConsent" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodConsent" varchar(30) NOT NULL,
	"DesConsent" varchar(200) NOT NULL,
	"IdeProduct" uuid NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NOT NULL,
	"DesConsentContent" json NOT NULL,
	"IndMandatory" bool NOT NULL,
	"NumOrder" int4 NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SConsent" PRIMARY KEY ("IdeConsent"),
	CONSTRAINT "UK_SConsent_01" UNIQUE ("CodConsent")
);
CREATE INDEX "IX_SConsent_SProduct" ON ars_platform."SConsent" USING btree ("IdeProduct");
CREATE INDEX "IX_SConsent_SState" ON ars_platform."SConsent" USING btree ("IdeState");
CREATE INDEX "IX_SConsent_STextContent" ON ars_platform."SConsent" USING btree ("IdeTextContent");


-- ars_platform."SContactClass" definition

-- Drop table

-- DROP TABLE ars_platform."SContactClass";

CREATE TABLE ars_platform."SContactClass" (
	"IdeContactClass" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodContactClass" varchar(30) NOT NULL,
	"DesContactClass" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SContactClass" PRIMARY KEY ("IdeContactClass"),
	CONSTRAINT "UK_SContactClass_01" UNIQUE ("CodContactClass")
);
CREATE INDEX "IX_SContactClass_SState" ON ars_platform."SContactClass" USING btree ("IdeState");
CREATE INDEX "IX_SContactClass_STextContent" ON ars_platform."SContactClass" USING btree ("IdeTextContent");


-- ars_platform."SCountry" definition

-- Drop table

-- DROP TABLE ars_platform."SCountry";

CREATE TABLE ars_platform."SCountry" (
	"IdeCountry" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodCountry" varchar(30) NOT NULL,
	"DesCountry" varchar(200) NOT NULL,
	"CodDDI" varchar(30) NULL,
	"IdeLanguage" uuid NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SCountry" PRIMARY KEY ("IdeCountry"),
	CONSTRAINT "UK_SCountry_01" UNIQUE ("CodCountry")
);
CREATE INDEX "IX_SCountry_SLanguage" ON ars_platform."SCountry" USING btree ("IdeLanguage");
CREATE INDEX "IX_SCountry_SState" ON ars_platform."SCountry" USING btree ("IdeState");
CREATE INDEX "IX_SCountry_STextContent" ON ars_platform."SCountry" USING btree ("IdeTextContent");


-- ars_platform."SCoverage" definition

-- Drop table

-- DROP TABLE ars_platform."SCoverage";

CREATE TABLE ars_platform."SCoverage" (
	"IdeCoverage" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodCoverage" varchar(30) NOT NULL,
	"DesCoverage" varchar(200) NOT NULL,
	"IdeInsuranceLine" uuid NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SCoverage" PRIMARY KEY ("IdeCoverage"),
	CONSTRAINT "UK_SCoverage_01" UNIQUE ("CodCoverage")
);
CREATE INDEX "IX_SCoverage_SInsuranceLine" ON ars_platform."SCoverage" USING btree ("IdeInsuranceLine");
CREATE INDEX "IX_SCoverage_SState" ON ars_platform."SCoverage" USING btree ("IdeState");
CREATE INDEX "IX_SCoverage_STextContent" ON ars_platform."SCoverage" USING btree ("IdeTextContent");


-- ars_platform."SCoverageGuarantee" definition

-- Drop table

-- DROP TABLE ars_platform."SCoverageGuarantee";

CREATE TABLE ars_platform."SCoverageGuarantee" (
	"IdeCoverageGuarantee" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeCoveragePlan" uuid NOT NULL,
	"IdeGuarantee" uuid NOT NULL,
	"DesShort" varchar(150) NULL,
	"DesLarge" varchar NULL,
	"TstInitial" date NOT NULL,
	"TstEnd" date NULL,
	"IndCoverageAccumulate" bool NOT NULL,
	"IdeDeductibleType" uuid NOT NULL,
	"DeductibleTypeValue" numeric NULL,
	"IdeLimitType" uuid NOT NULL,
	"LimitTypeValue" numeric NULL,
	"NumApplyUse" numeric NULL,
	"Order" int4 NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SCoverageGuarantee" PRIMARY KEY ("IdeCoverageGuarantee"),
	CONSTRAINT "UK_SCoverageGuarantee_01" UNIQUE ("IdeCoveragePlan", "IdeGuarantee")
);
CREATE INDEX "IX_SCoverageGuarantee_SCoveragePlan" ON ars_platform."SCoverageGuarantee" USING btree ("IdeCoveragePlan");
CREATE INDEX "IX_SCoverageGuarantee_SDeductibleType" ON ars_platform."SCoverageGuarantee" USING btree ("IdeDeductibleType");
CREATE INDEX "IX_SCoverageGuarantee_SGuarantee" ON ars_platform."SCoverageGuarantee" USING btree ("IdeGuarantee");
CREATE INDEX "IX_SCoverageGuarantee_SLimitType" ON ars_platform."SCoverageGuarantee" USING btree ("IdeLimitType");
CREATE INDEX "IX_SCoverageGuarantee_SState" ON ars_platform."SCoverageGuarantee" USING btree ("IdeState");
CREATE INDEX "IX_SCoverageGuarantee_STextContent" ON ars_platform."SCoverageGuarantee" USING btree ("IdeTextContent");


-- ars_platform."SCoveragePlan" definition

-- Drop table

-- DROP TABLE ars_platform."SCoveragePlan";

CREATE TABLE ars_platform."SCoveragePlan" (
	"IdeCoveragePlan" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdePlanProductRisk" uuid NOT NULL,
	"IdeCoverage" uuid NOT NULL,
	"DesShort" varchar(150) NULL,
	"DesLarge" varchar NULL,
	"IndMandatory" bool NOT NULL,
	"GetPrime" bool NOT NULL,
	"RefundPrime" bool NOT NULL,
	"ProratedGetPrime" bool NOT NULL,
	"ProratedRefundPrime" bool NOT NULL,
	"NumMonthsWaitingPeriod" int4 NOT NULL,
	"IndSplitPayment" bool NOT NULL,
	"IdeDeductibleType" uuid NOT NULL,
	"DeductibleTypeValue" numeric NULL,
	"IdeLimitType" uuid NOT NULL,
	"LimitTypeValue" numeric NULL,
	"IndPayPerUse" bool NOT NULL,
	"IndFixedAmount" bool NOT NULL,
	"LowerAmount" numeric NOT NULL,
	"UpperAmount" numeric NOT NULL,
	"IndFixedRate" bool NOT NULL,
	"LowerRate" numeric NOT NULL,
	"UpperRate" numeric NOT NULL,
	"IndFixedPrime" bool NOT NULL,
	"LowerPrime" numeric NOT NULL,
	"UpperPrime" numeric NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NULL,
	"InclusiveCoverage" json NULL,
	"ExclusiveCoverage" json NULL,
	"Order" int4 NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SCoveragePlan" PRIMARY KEY ("IdeCoveragePlan")
);
CREATE INDEX "IX_SCoveragePlan_SCoverage" ON ars_platform."SCoveragePlan" USING btree ("IdeCoverage");
CREATE INDEX "IX_SCoveragePlan_SDeductibleType" ON ars_platform."SCoveragePlan" USING btree ("IdeDeductibleType");
CREATE INDEX "IX_SCoveragePlan_SLimitType" ON ars_platform."SCoveragePlan" USING btree ("IdeLimitType");
CREATE INDEX "IX_SCoveragePlan_SPlanProductRisk" ON ars_platform."SCoveragePlan" USING btree ("IdePlanProductRisk");
CREATE INDEX "IX_SCoveragePlan_SState" ON ars_platform."SCoveragePlan" USING btree ("IdeState");


-- ars_platform."SCurrency" definition

-- Drop table

-- DROP TABLE ars_platform."SCurrency";

CREATE TABLE ars_platform."SCurrency" (
	"IdeCurrency" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodCurrency" varchar(30) NOT NULL,
	"DesCurrency" varchar(200) NOT NULL,
	"SymbolCurrency" varchar(30) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SCurrency" PRIMARY KEY ("IdeCurrency"),
	CONSTRAINT "UK_SCurrency_01" UNIQUE ("CodCurrency")
);
CREATE INDEX "IX_SCurrency_SState" ON ars_platform."SCurrency" USING btree ("IdeState");
CREATE INDEX "IX_SCurrency_STextContent" ON ars_platform."SCurrency" USING btree ("IdeTextContent");


-- ars_platform."SDeductibleType" definition

-- Drop table

-- DROP TABLE ars_platform."SDeductibleType";

CREATE TABLE ars_platform."SDeductibleType" (
	"IdeDeductibleType" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodDeductibleType" varchar(30) NOT NULL,
	"DesDeductibleType" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SDeductibleType" PRIMARY KEY ("IdeDeductibleType"),
	CONSTRAINT "UK_SDeductibleType_01" UNIQUE ("CodDeductibleType")
);
CREATE INDEX "IX_SDeductibleType_SState" ON ars_platform."SDeductibleType" USING btree ("IdeState");
CREATE INDEX "IX_SDeductibleType_STextContent" ON ars_platform."SDeductibleType" USING btree ("IdeTextContent");


-- ars_platform."SDepreciation" definition

-- Drop table

-- DROP TABLE ars_platform."SDepreciation";

CREATE TABLE ars_platform."SDepreciation" (
	"IdeDepreciation" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeRiskProduct" uuid NULL,
	"IndSubscription" bool NOT NULL,
	"NumberMonths" int4 NOT NULL,
	"Percentaje" numeric NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SDepreciation" PRIMARY KEY ("IdeDepreciation")
);
CREATE INDEX "IX_SDepreciation_SRiskProduct" ON ars_platform."SDepreciation" USING btree ("IdeRiskProduct");
CREATE INDEX "IX_SDepreciation_SState" ON ars_platform."SDepreciation" USING btree ("IdeState");


-- ars_platform."SDiscount" definition

-- Drop table

-- DROP TABLE ars_platform."SDiscount";

CREATE TABLE ars_platform."SDiscount" (
	"IdeDiscount" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodDiscount" varchar(30) NOT NULL,
	"DesDiscount" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SDiscount" PRIMARY KEY ("IdeDiscount"),
	CONSTRAINT "UK_SDiscount_01" UNIQUE ("CodDiscount")
);
CREATE INDEX "IX_SDiscount_SState" ON ars_platform."SDiscount" USING btree ("IdeState");
CREATE INDEX "IX_SDiscount_STextContent" ON ars_platform."SDiscount" USING btree ("IdeTextContent");


-- ars_platform."SDiscountLevel" definition

-- Drop table

-- DROP TABLE ars_platform."SDiscountLevel";

CREATE TABLE ars_platform."SDiscountLevel" (
	"IdeDiscountLevel" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodDiscountLevel" varchar(30) NOT NULL,
	"DesDiscountLevel" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SDiscountLevel" PRIMARY KEY ("IdeDiscountLevel"),
	CONSTRAINT "UK_SDiscountLevel_01" UNIQUE ("CodDiscountLevel")
);
CREATE INDEX "IX_SDiscountLevel_SState" ON ars_platform."SDiscountLevel" USING btree ("IdeState");
CREATE INDEX "IX_SDiscountLevel_STextContent" ON ars_platform."SDiscountLevel" USING btree ("IdeTextContent");


-- ars_platform."SDistributionChannel" definition

-- Drop table

-- DROP TABLE ars_platform."SDistributionChannel";

CREATE TABLE ars_platform."SDistributionChannel" (
	"IdeDistributionChannel" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodDistributionChannel" varchar(30) NOT NULL,
	"DesDistributionChannel" varchar(200) NOT NULL,
	"IdeChannelType" uuid NULL,
	"IdeDistributionChannelParent" uuid NULL,
	"IdeBroker" uuid NULL,
	"IdePerson" uuid NULL,
	"Image" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SDistributionChannel" PRIMARY KEY ("IdeDistributionChannel"),
	CONSTRAINT "UK_SDistributionChannel_01" UNIQUE ("CodDistributionChannel")
);
CREATE INDEX "IX_SDistributionChannel_SChannelType" ON ars_platform."SDistributionChannel" USING btree ("IdeChannelType");
CREATE INDEX "IX_SDistributionChannel_SDistributionChannel" ON ars_platform."SDistributionChannel" USING btree ("IdeDistributionChannelParent");
CREATE INDEX "IX_SDistributionChannel_SState" ON ars_platform."SDistributionChannel" USING btree ("IdeState");
CREATE INDEX "IX_SDistributionChannel_TBroker" ON ars_platform."SDistributionChannel" USING btree ("IdeBroker");
CREATE INDEX "IX_SDistributionChannel_TPerson" ON ars_platform."SDistributionChannel" USING btree ("IdePerson");


-- ars_platform."SDistributionWay" definition

-- Drop table

-- DROP TABLE ars_platform."SDistributionWay";

CREATE TABLE ars_platform."SDistributionWay" (
	"IdeDistributionWay" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodDistributionWay" varchar(30) NOT NULL,
	"DesDistributionWay" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SDistributionWay" PRIMARY KEY ("IdeDistributionWay"),
	CONSTRAINT "UK_SDistributionWay_01" UNIQUE ("CodDistributionWay")
);
CREATE INDEX "IX_SDistributionWay_SState" ON ars_platform."SDistributionWay" USING btree ("IdeState");
CREATE INDEX "IX_SDistributionWay_STextContent" ON ars_platform."SDistributionWay" USING btree ("IdeTextContent");


-- ars_platform."SEndorsement" definition

-- Drop table

-- DROP TABLE ars_platform."SEndorsement";

CREATE TABLE ars_platform."SEndorsement" (
	"IdeEndorsement" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodEndorsement" varchar(30) NOT NULL,
	"DesEndorsement" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SEndorsement" PRIMARY KEY ("IdeEndorsement"),
	CONSTRAINT "UK_SEndorsement_01" UNIQUE ("CodEndorsement")
);
CREATE INDEX "IX_SEndorsement_SState" ON ars_platform."SEndorsement" USING btree ("IdeState");
CREATE INDEX "IX_SEndorsement_STextContent" ON ars_platform."SEndorsement" USING btree ("IdeTextContent");


-- ars_platform."SEndorsementReason" definition

-- Drop table

-- DROP TABLE ars_platform."SEndorsementReason";

CREATE TABLE ars_platform."SEndorsementReason" (
	"IdeEndorsementReason" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodEndorsementReason" varchar(30) NOT NULL,
	"DesEndorsementReason" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SEndorsementReason" PRIMARY KEY ("IdeEndorsementReason"),
	CONSTRAINT "UK_SEndorsementReason_01" UNIQUE ("CodEndorsementReason")
);
CREATE INDEX "IX_SEndorsementReason_SState" ON ars_platform."SEndorsementReason" USING btree ("IdeState");
CREATE INDEX "IX_SEndorsementReason_STextContent" ON ars_platform."SEndorsementReason" USING btree ("IdeTextContent");


-- ars_platform."SEntity" definition

-- Drop table

-- DROP TABLE ars_platform."SEntity";

CREATE TABLE ars_platform."SEntity" (
	"IdeEntity" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodEntity" varchar(30) NOT NULL,
	"DesEntity" varchar(200) NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SEntity" PRIMARY KEY ("IdeEntity"),
	CONSTRAINT "UK_SEntity_01" UNIQUE ("CodEntity")
);
CREATE INDEX "IX_SEntity_SState" ON ars_platform."SEntity" USING btree ("IdeState");


-- ars_platform."SFieldDictionary" definition

-- Drop table

-- DROP TABLE ars_platform."SFieldDictionary";

CREATE TABLE ars_platform."SFieldDictionary" (
	"IdeFieldDictionary" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodFieldDictionary" varchar(30) NOT NULL,
	"DesFieldDictionary" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SFieldDictionary" PRIMARY KEY ("IdeFieldDictionary"),
	CONSTRAINT "UK_SFieldDictionary_01" UNIQUE ("CodFieldDictionary")
);
CREATE INDEX "IX_SFieldDictionary_SState" ON ars_platform."SFieldDictionary" USING btree ("IdeState");
CREATE INDEX "IX_SFieldDictionary_STextContent" ON ars_platform."SFieldDictionary" USING btree ("IdeTextContent");


-- ars_platform."SFieldValue" definition

-- Drop table

-- DROP TABLE ars_platform."SFieldValue";

CREATE TABLE ars_platform."SFieldValue" (
	"IdeFieldValue" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodFieldValue" varchar(200) NOT NULL,
	"DesFieldValue" varchar(200) NOT NULL,
	"IdeFieldDictionary" uuid NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SFieldValue" PRIMARY KEY ("IdeFieldValue"),
	CONSTRAINT "UK_SFieldValue_01" UNIQUE ("CodFieldValue")
);
CREATE INDEX "IX_SFieldValue_SFieldDictionary" ON ars_platform."SFieldValue" USING btree ("IdeFieldDictionary");
CREATE INDEX "IX_SFieldValue_SState" ON ars_platform."SFieldValue" USING btree ("IdeState");
CREATE INDEX "IX_SFieldValue_STextContent" ON ars_platform."SFieldValue" USING btree ("IdeTextContent");


-- ars_platform."SFlowStep" definition

-- Drop table

-- DROP TABLE ars_platform."SFlowStep";

CREATE TABLE ars_platform."SFlowStep" (
	"IdeFlowStep" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeProcessFlow" uuid NOT NULL,
	"IndInitialStep" bool NOT NULL,
	"IdeStepCurrent" uuid NOT NULL,
	"IndResultOK" bool NOT NULL,
	"IdeStepForward" uuid NOT NULL,
	"IdeScreen" uuid NOT NULL,
	"FlowStepContent" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SFlowStep" PRIMARY KEY ("IdeFlowStep"),
	CONSTRAINT "UK_SFlowStep_01" UNIQUE ("IdeProcessFlow", "IdeStepCurrent", "IndResultOK", "IdeStepForward")
);
CREATE INDEX "IX_SFlowStep_SProcessFlow" ON ars_platform."SFlowStep" USING btree ("IdeProcessFlow");
CREATE INDEX "IX_SFlowStep_SScreen" ON ars_platform."SFlowStep" USING btree ("IdeScreen");
CREATE INDEX "IX_SFlowStep_SState" ON ars_platform."SFlowStep" USING btree ("IdeState");
CREATE INDEX "IX_SStepCurrent_SStep" ON ars_platform."SFlowStep" USING btree ("IdeStepCurrent");
CREATE INDEX "IX_SStepForward_SStep" ON ars_platform."SFlowStep" USING btree ("IdeStepForward");


-- ars_platform."SGender" definition

-- Drop table

-- DROP TABLE ars_platform."SGender";

CREATE TABLE ars_platform."SGender" (
	"IdeGender" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodGender" varchar(30) NOT NULL,
	"DesGender" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SGender" PRIMARY KEY ("IdeGender"),
	CONSTRAINT "UK_SGender_01" UNIQUE ("CodGender")
);
CREATE INDEX "IX_SGender_SState" ON ars_platform."SGender" USING btree ("IdeState");
CREATE INDEX "IX_SGender_STextContent" ON ars_platform."SGender" USING btree ("IdeTextContent");


-- ars_platform."SGuarantee" definition

-- Drop table

-- DROP TABLE ars_platform."SGuarantee";

CREATE TABLE ars_platform."SGuarantee" (
	"IdeGuarantee" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodGuarantee" varchar(30) NOT NULL,
	"DesGuarantee" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SGuarantee" PRIMARY KEY ("IdeGuarantee"),
	CONSTRAINT "UK_SGuarantee_01" UNIQUE ("CodGuarantee")
);
CREATE INDEX "IX_SGuarantee_SState" ON ars_platform."SGuarantee" USING btree ("IdeState");
CREATE INDEX "IX_SGuarantee_STextContent" ON ars_platform."SGuarantee" USING btree ("IdeTextContent");


-- ars_platform."SIdentificationType" definition

-- Drop table

-- DROP TABLE ars_platform."SIdentificationType";

CREATE TABLE ars_platform."SIdentificationType" (
	"IdeIdentificationType" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodIdentificationType" varchar(30) NOT NULL,
	"DesIdentificationType" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SIdentificationType" PRIMARY KEY ("IdeIdentificationType"),
	CONSTRAINT "UK_SIdentificationType_01" UNIQUE ("CodIdentificationType")
);
CREATE INDEX "IX_SIdentificationType_SState" ON ars_platform."SIdentificationType" USING btree ("IdeState");
CREATE INDEX "IX_SIdentificationType_STextContent" ON ars_platform."SIdentificationType" USING btree ("IdeTextContent");


-- ars_platform."SInsuranceArea" definition

-- Drop table

-- DROP TABLE ars_platform."SInsuranceArea";

CREATE TABLE ars_platform."SInsuranceArea" (
	"IdeInsuranceArea" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodInsuranceArea" varchar(30) NOT NULL,
	"DesInsuranceArea" varchar(200) NOT NULL,
	"DesShort" varchar(150) NULL,
	"DesLarge" varchar NULL,
	"IdeInsuranceAreaParent" uuid NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SInsuranceArea" PRIMARY KEY ("IdeInsuranceArea"),
	CONSTRAINT "UK_SInsuranceArea_01" UNIQUE ("CodInsuranceArea")
);
CREATE INDEX "IX_SInsuranceArea_SInsuranceArea" ON ars_platform."SInsuranceArea" USING btree ("IdeInsuranceAreaParent");
CREATE INDEX "IX_SInsuranceArea_SState" ON ars_platform."SInsuranceArea" USING btree ("IdeState");
CREATE INDEX "IX_SInsuranceArea_STextContent" ON ars_platform."SInsuranceArea" USING btree ("IdeTextContent");


-- ars_platform."SInsuranceLine" definition

-- Drop table

-- DROP TABLE ars_platform."SInsuranceLine";

CREATE TABLE ars_platform."SInsuranceLine" (
	"IdeInsuranceLine" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodInsuranceLine" varchar(30) NOT NULL,
	"DesInsuranceLine" varchar(200) NOT NULL,
	"DesShort" varchar(150) NULL,
	"DesLarge" varchar NULL,
	"IdeInsuranceArea" uuid NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SInsuranceLine" PRIMARY KEY ("IdeInsuranceLine"),
	CONSTRAINT "UK_SInsuranceLine_01" UNIQUE ("CodInsuranceLine")
);
CREATE INDEX "IX_SInsuranceLine_SInsuranceArea" ON ars_platform."SInsuranceLine" USING btree ("IdeInsuranceArea");
CREATE INDEX "IX_SInsuranceLine_SState" ON ars_platform."SInsuranceLine" USING btree ("IdeState");
CREATE INDEX "IX_SInsuranceLine_STextContent" ON ars_platform."SInsuranceLine" USING btree ("IdeTextContent");


-- ars_platform."SLanguage" definition

-- Drop table

-- DROP TABLE ars_platform."SLanguage";

CREATE TABLE ars_platform."SLanguage" (
	"IdeLanguage" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodLanguage" varchar(30) NOT NULL,
	"DesLanguage" varchar(200) NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SLanguage" PRIMARY KEY ("IdeLanguage"),
	CONSTRAINT "UK_SLanguage_01" UNIQUE ("CodLanguage")
);
CREATE INDEX "IX_SLanguage_SState" ON ars_platform."SLanguage" USING btree ("IdeState");


-- ars_platform."SLimitType" definition

-- Drop table

-- DROP TABLE ars_platform."SLimitType";

CREATE TABLE ars_platform."SLimitType" (
	"IdeLimitType" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodLimitType" varchar(30) NOT NULL,
	"DesLimitType" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SLimitType" PRIMARY KEY ("IdeLimitType"),
	CONSTRAINT "UK_SLimitType_01" UNIQUE ("CodLimitType")
);
CREATE INDEX "IX_SLimitType_SState" ON ars_platform."SLimitType" USING btree ("IdeState");
CREATE INDEX "IX_SLimitType_STextContent" ON ars_platform."SLimitType" USING btree ("IdeTextContent");


-- ars_platform."SLocation" definition

-- Drop table

-- DROP TABLE ars_platform."SLocation";

CREATE TABLE ars_platform."SLocation" (
	"IdeLocation" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodLocation" varchar(30) NOT NULL,
	"DesLocation" varchar(200) NOT NULL,
	"IdeLocationParent" uuid NULL,
	"IdeCountry" uuid NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SLocation" PRIMARY KEY ("IdeLocation"),
	CONSTRAINT "UK_SLocation_01" UNIQUE ("CodLocation", "IdeCountry")
);
CREATE INDEX "IX_SLocation_SCountry" ON ars_platform."SLocation" USING btree ("IdeCountry");
CREATE INDEX "IX_SLocation_SLocation" ON ars_platform."SLocation" USING btree ("IdeLocationParent");
CREATE INDEX "IX_SLocation_SState" ON ars_platform."SLocation" USING btree ("IdeState");
CREATE INDEX "IX_SLocation_STextContent" ON ars_platform."SLocation" USING btree ("IdeTextContent");


-- ars_platform."SMaritalStatus" definition

-- Drop table

-- DROP TABLE ars_platform."SMaritalStatus";

CREATE TABLE ars_platform."SMaritalStatus" (
	"IdeMaritalStatus" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodMaritalStatus" varchar(30) NOT NULL,
	"DesMaritalStatus" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SMaritalStatus" PRIMARY KEY ("IdeMaritalStatus"),
	CONSTRAINT "UQ_SMaritalStatus_01" UNIQUE ("CodMaritalStatus")
);
CREATE INDEX "IX_SMaritalStatus_SState" ON ars_platform."SMaritalStatus" USING btree ("IdeState");
CREATE INDEX "IX_SMaritalStatus_STextContent" ON ars_platform."SMaritalStatus" USING btree ("IdeTextContent");


-- ars_platform."SModelAttribute" definition

-- Drop table

-- DROP TABLE ars_platform."SModelAttribute";

CREATE TABLE ars_platform."SModelAttribute" (
	"IdeModelAttribute" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodModelAttribute" varchar(200) NOT NULL,
	"DesModelAttribute" varchar(200) NOT NULL,
	"IdeEntityApply" uuid NOT NULL,
	"IdeEntityReference" uuid NOT NULL,
	"IdeFlowStep" uuid NULL,
	"IdeReference" uuid NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SModelAttribute" PRIMARY KEY ("IdeModelAttribute"),
	CONSTRAINT "UK_SModelAttribute_01" UNIQUE ("CodModelAttribute")
);
CREATE INDEX "IX_SModelAttribute_SEntityApply" ON ars_platform."SModelAttribute" USING btree ("IdeEntityApply");
CREATE INDEX "IX_SModelAttribute_SEntityReference" ON ars_platform."SModelAttribute" USING btree ("IdeEntityReference");
CREATE INDEX "IX_SModelAttribute_SFlowStep" ON ars_platform."SModelAttribute" USING btree ("IdeFlowStep");
CREATE INDEX "IX_SModelAttribute_SState" ON ars_platform."SModelAttribute" USING btree ("IdeState");
CREATE INDEX "IX_SModelAttribute_STextContent" ON ars_platform."SModelAttribute" USING btree ("IdeTextContent");


-- ars_platform."SOperation" definition

-- Drop table

-- DROP TABLE ars_platform."SOperation";

CREATE TABLE ars_platform."SOperation" (
	"IdeOperation" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodOperation" varchar(30) NOT NULL,
	"DesOperation" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SOperation" PRIMARY KEY ("IdeOperation"),
	CONSTRAINT "UK_SOperation_01" UNIQUE ("CodOperation")
);
CREATE INDEX "IX_SOperation_SState" ON ars_platform."SOperation" USING btree ("IdeState");
CREATE INDEX "IX_SOperation_STextContent" ON ars_platform."SOperation" USING btree ("IdeTextContent");


-- ars_platform."SOperationProduct" definition

-- Drop table

-- DROP TABLE ars_platform."SOperationProduct";

CREATE TABLE ars_platform."SOperationProduct" (
	"IdeOperationProduct" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeProduct" uuid NOT NULL,
	"IdeOperation" uuid NOT NULL,
	"IdeProcess" uuid NOT NULL,
	"IdeOperationService" uuid NULL,
	"IdeProductEndorsement" uuid NULL,
	"Order" numeric NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SOperationProduct" PRIMARY KEY ("IdeOperationProduct"),
	CONSTRAINT "UK_SOperationProduct_01" UNIQUE ("IdeProduct", "IdeOperation", "IdeProcess")
);
CREATE INDEX "IX_SOperationProduct_SOperation" ON ars_platform."SOperationProduct" USING btree ("IdeOperation");
CREATE INDEX "IX_SOperationProduct_SOperationService" ON ars_platform."SOperationProduct" USING btree ("IdeOperationService");
CREATE INDEX "IX_SOperationProduct_SProcess" ON ars_platform."SOperationProduct" USING btree ("IdeProcess");
CREATE INDEX "IX_SOperationProduct_SProduct" ON ars_platform."SOperationProduct" USING btree ("IdeProduct");
CREATE INDEX "IX_SOperationProduct_SProductEndorsement" ON ars_platform."SOperationProduct" USING btree ("IdeProductEndorsement");
CREATE INDEX "IX_SOperationProduct_SState" ON ars_platform."SOperationProduct" USING btree ("IdeState");


-- ars_platform."SOperationProductTemplate" definition

-- Drop table

-- DROP TABLE ars_platform."SOperationProductTemplate";

CREATE TABLE ars_platform."SOperationProductTemplate" (
	"IdeOperationProductTemplate" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeOperationProduct" uuid NOT NULL,
	"CodTemplateType" varchar(60) NOT NULL,
	"TemplateContent" varchar NOT NULL,
	"IdePersonRol" uuid NOT NULL,
	"NumOrder" int4 NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SOperationProductTemplate" PRIMARY KEY ("IdeOperationProductTemplate")
);
CREATE INDEX "IX_SOperationProductTemplate_SOperationProduct" ON ars_platform."SOperationProductTemplate" USING btree ("IdeOperationProduct");
CREATE INDEX "IX_SOperationProductTemplate_SPersonRol" ON ars_platform."SOperationProductTemplate" USING btree ("IdePersonRol");
CREATE INDEX "IX_SOperationProductTemplate_SState" ON ars_platform."SOperationProductTemplate" USING btree ("IdeState");


-- ars_platform."SOperationService" definition

-- Drop table

-- DROP TABLE ars_platform."SOperationService";

CREATE TABLE ars_platform."SOperationService" (
	"IdeOperationService" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodOperationService" varchar(30) NOT NULL,
	"DesOperationService" varchar(200) NOT NULL,
	"IdeOperation" uuid NOT NULL,
	"ServiceData" json NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SOperationService" PRIMARY KEY ("IdeOperationService"),
	CONSTRAINT "UK_SOperationService_01" UNIQUE ("CodOperationService")
);
CREATE INDEX "IX_SOperationService_SOperation" ON ars_platform."SOperationService" USING btree ("IdeOperation");
CREATE INDEX "IX_SOperationService_SState" ON ars_platform."SOperationService" USING btree ("IdeState");
CREATE INDEX "IX_SOperationService_STextContent" ON ars_platform."SOperationService" USING btree ("IdeTextContent");


-- ars_platform."SPaymentFraction" definition

-- Drop table

-- DROP TABLE ars_platform."SPaymentFraction";

CREATE TABLE ars_platform."SPaymentFraction" (
	"IdePaymentFraction" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodPaymentFraction" varchar(30) NOT NULL,
	"DesPaymentFraction" varchar(200) NOT NULL,
	"NumFraction" int4 NOT NULL,
	"NumOrder" int4 NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SPaymentFraction" PRIMARY KEY ("IdePaymentFraction"),
	CONSTRAINT "UK_SPaymentFraction_01" UNIQUE ("CodPaymentFraction")
);
CREATE INDEX "IX_SPaymentFraction_SState" ON ars_platform."SPaymentFraction" USING btree ("IdeState");
CREATE INDEX "IX_SPaymentFraction_STextContent" ON ars_platform."SPaymentFraction" USING btree ("IdeTextContent");


-- ars_platform."SPaymentType" definition

-- Drop table

-- DROP TABLE ars_platform."SPaymentType";

CREATE TABLE ars_platform."SPaymentType" (
	"IdePaymentType" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodPaymentType" varchar(30) NOT NULL,
	"DesPaymentType" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SPaymentType" PRIMARY KEY ("IdePaymentType"),
	CONSTRAINT "UK_SPaymentType_01" UNIQUE ("CodPaymentType")
);
CREATE INDEX "IX_SPaymentType_SState" ON ars_platform."SPaymentType" USING btree ("IdeState");
CREATE INDEX "IX_SPaymentType_STextContent" ON ars_platform."SPaymentType" USING btree ("IdeTextContent");


-- ars_platform."SPersonRol" definition

-- Drop table

-- DROP TABLE ars_platform."SPersonRol";

CREATE TABLE ars_platform."SPersonRol" (
	"IdePersonRol" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodPersonRol" varchar(30) NOT NULL,
	"DesPersonRol" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SPersonRol" PRIMARY KEY ("IdePersonRol"),
	CONSTRAINT "UK_SPersonRol_01" UNIQUE ("CodPersonRol")
);
CREATE INDEX "IX_SPersonRol_SState" ON ars_platform."SPersonRol" USING btree ("IdeState");
CREATE INDEX "IX_SPersonRol_STextContent" ON ars_platform."SPersonRol" USING btree ("IdeTextContent");
CREATE INDEX "IX_SSiteMap_SState" ON ars_platform."SPersonRol" USING btree ("IdeState");
CREATE INDEX "IX_SSiteMap_STextContent" ON ars_platform."SPersonRol" USING btree ("IdeTextContent");


-- ars_platform."SPlanProduct" definition

-- Drop table

-- DROP TABLE ars_platform."SPlanProduct";

CREATE TABLE ars_platform."SPlanProduct" (
	"IdePlanProduct" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodPlanProduct" varchar(30) NOT NULL,
	"DesPlanProduct" varchar(200) NOT NULL,
	"DesShort" varchar(150) NULL,
	"DesLarge" varchar NULL,
	"IdeProduct" uuid NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SPlanProduct" PRIMARY KEY ("IdePlanProduct"),
	CONSTRAINT "UK_SPlanProduct_01" UNIQUE ("CodPlanProduct")
);
CREATE INDEX "IX_SPlanProduct_SProduct" ON ars_platform."SPlanProduct" USING btree ("IdeProduct");
CREATE INDEX "IX_SPlanProduct_SState" ON ars_platform."SPlanProduct" USING btree ("IdeState");
CREATE INDEX "IX_SPlanProduct_STextContent" ON ars_platform."SPlanProduct" USING btree ("IdeTextContent");


-- ars_platform."SPlanProductRisk" definition

-- Drop table

-- DROP TABLE ars_platform."SPlanProductRisk";

CREATE TABLE ars_platform."SPlanProductRisk" (
	"IdePlanProductRisk" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdePlanProduct" uuid NOT NULL,
	"IdeRiskProduct" uuid NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SPlanProductRisk" PRIMARY KEY ("IdePlanProductRisk")
);
CREATE INDEX "IX_SPlanProductRisk_SPlanProduct" ON ars_platform."SPlanProductRisk" USING btree ("IdePlanProduct");
CREATE INDEX "IX_SPlanProductRisk_SRiskProduct" ON ars_platform."SPlanProductRisk" USING btree ("IdeRiskProduct");
CREATE INDEX "IX_SPlanProductRisk_SState" ON ars_platform."SPlanProductRisk" USING btree ("IdeState");


-- ars_platform."SPricingConcept" definition

-- Drop table

-- DROP TABLE ars_platform."SPricingConcept";

CREATE TABLE ars_platform."SPricingConcept" (
	"IdePricingConcept" uuid DEFAULT uuid_generate_v1() NOT NULL,
	"IdeConcept" uuid NOT NULL,
	"IdePricingRuleSet" uuid NOT NULL,
	"Formula" text NOT NULL,
	"IsCalculated" bool DEFAULT true NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SPricingConcept" PRIMARY KEY ("IdePricingConcept")
);
CREATE INDEX "IX_SPricingConcept_SConcept" ON ars_platform."SPricingConcept" USING btree ("IdeConcept");
CREATE INDEX "IX_SPricingConcept_SPricingRuleSet" ON ars_platform."SPricingConcept" USING btree ("IdePricingRuleSet");
CREATE INDEX "IX_SPricingConcept_SState" ON ars_platform."SPricingConcept" USING btree ("IdeState");


-- ars_platform."SPricingRuleSet" definition

-- Drop table

-- DROP TABLE ars_platform."SPricingRuleSet";

CREATE TABLE ars_platform."SPricingRuleSet" (
	"IdePricingRuleSet" uuid DEFAULT uuid_generate_v1() NOT NULL,
	"CodPricingRuleSet" varchar(30) NOT NULL,
	"DesPricingRuleSet" json NOT NULL,
	"IdeProduct" uuid NULL,
	"IdePlanProductRisk" uuid NULL,
	"IdeCoveragePlan" uuid NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SPricingRuleSet" PRIMARY KEY ("IdePricingRuleSet"),
	CONSTRAINT "UK_SPricingRuleSet_01" UNIQUE ("CodPricingRuleSet")
);
CREATE INDEX "IX_SPricingRuleSet_SCoveragePlan" ON ars_platform."SPricingRuleSet" USING btree ("IdeCoveragePlan");
CREATE INDEX "IX_SPricingRuleSet_SPlanProductRisk" ON ars_platform."SPricingRuleSet" USING btree ("IdePlanProductRisk");
CREATE INDEX "IX_SPricingRuleSet_SProduct" ON ars_platform."SPricingRuleSet" USING btree ("IdeProduct");
CREATE INDEX "IX_SPricingRuleSet_SState" ON ars_platform."SPricingRuleSet" USING btree ("IdeState");


-- ars_platform."SProcess" definition

-- Drop table

-- DROP TABLE ars_platform."SProcess";

CREATE TABLE ars_platform."SProcess" (
	"IdeProcess" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodProcess" varchar(30) NOT NULL,
	"DesProcess" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SProcess" PRIMARY KEY ("IdeProcess"),
	CONSTRAINT "UK_SProcess_01" UNIQUE ("CodProcess")
);
CREATE INDEX "IX_SProcess_SState" ON ars_platform."SProcess" USING btree ("IdeState");
CREATE INDEX "IX_SProcess_STextContent" ON ars_platform."SProcess" USING btree ("IdeTextContent");


-- ars_platform."SProcessFlow" definition

-- Drop table

-- DROP TABLE ars_platform."SProcessFlow";

CREATE TABLE ars_platform."SProcessFlow" (
	"IdeProcessFlow" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodProcessFlow" varchar(30) NOT NULL,
	"DesProcessFlow" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SProcessFlow" PRIMARY KEY ("IdeProcessFlow"),
	CONSTRAINT "UK_SProcessFlow_01" UNIQUE ("CodProcessFlow")
);
CREATE INDEX "IX_SProcessFlow_SState" ON ars_platform."SProcessFlow" USING btree ("IdeState");
CREATE INDEX "IX_SProcessFlow_STextContent" ON ars_platform."SProcessFlow" USING btree ("IdeTextContent");


-- ars_platform."SProduct" definition

-- Drop table

-- DROP TABLE ars_platform."SProduct";

CREATE TABLE ars_platform."SProduct" (
	"IdeProduct" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodProduct" varchar(30) NOT NULL,
	"DesProduct" varchar(200) NOT NULL,
	"DesShort" varchar(150) NULL,
	"DesLarge" varchar NULL,
	"Image" varchar NULL,
	"IdeInsuranceArea" uuid NOT NULL,
	"IdeCurrency" uuid NOT NULL,
	"ValidityDays" int4 NULL,
	"CodStartTime" varchar(15) NOT NULL,
	"IndGenerateAllFraction" bool NOT NULL,
	"IndProportionalPrime" bool DEFAULT true NOT NULL,
	"TstInitial" date NOT NULL,
	"TstEnd" date NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SProduct" PRIMARY KEY ("IdeProduct"),
	CONSTRAINT "UK_SProduct_01" UNIQUE ("CodProduct")
);
CREATE INDEX "IX_SProduct_SCurrency" ON ars_platform."SProduct" USING btree ("IdeCurrency");
CREATE INDEX "IX_SProduct_SInsuranceArea" ON ars_platform."SProduct" USING btree ("IdeInsuranceArea");
CREATE INDEX "IX_SProduct_SState" ON ars_platform."SProduct" USING btree ("IdeState");
CREATE INDEX "IX_SProduct_STextContent" ON ars_platform."SProduct" USING btree ("IdeTextContent");


-- ars_platform."SProductDiscount" definition

-- Drop table

-- DROP TABLE ars_platform."SProductDiscount";

CREATE TABLE ars_platform."SProductDiscount" (
	"IdeProductDiscount" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodProductDiscount" varchar(30) NOT NULL,
	"DesProductDiscount" varchar(200) NOT NULL,
	"IdeProduct" uuid NOT NULL,
	"IdeDiscount" uuid NOT NULL,
	"IdeDiscountLevel" uuid NOT NULL,
	"IndDiscount" bool NOT NULL,
	"PorDefault" numeric NULL,
	"PorMin" numeric NULL,
	"PorMax" numeric NULL,
	"IndAutomatic" bool NOT NULL,
	"Order" int4 NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SProductDiscount" PRIMARY KEY ("IdeProductDiscount"),
	CONSTRAINT "UK_SProductDiscount_01" UNIQUE ("CodProductDiscount")
);
CREATE INDEX "IX_SProductDiscount_SDiscount" ON ars_platform."SProductDiscount" USING btree ("IdeDiscount");
CREATE INDEX "IX_SProductDiscount_SDiscountLevel" ON ars_platform."SProductDiscount" USING btree ("IdeDiscountLevel");
CREATE INDEX "IX_SProductDiscount_SProduct" ON ars_platform."SProductDiscount" USING btree ("IdeProduct");
CREATE INDEX "IX_SProductDiscount_SState" ON ars_platform."SProductDiscount" USING btree ("IdeState");
CREATE INDEX "IX_SProductDiscount_STextContent" ON ars_platform."SProductDiscount" USING btree ("IdeTextContent");


-- ars_platform."SProductEndorsement" definition

-- Drop table

-- DROP TABLE ars_platform."SProductEndorsement";

CREATE TABLE ars_platform."SProductEndorsement" (
	"IdeProductEndorsement" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodProductEndorsement" varchar(30) NOT NULL,
	"DesProductEndorsement" varchar(200) NOT NULL,
	"IdeProduct" uuid NOT NULL,
	"IdeEndorsement" uuid NOT NULL,
	"IdeEndorsementReason" uuid NOT NULL,
	"ConditionData" json NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SProductEndorsement" PRIMARY KEY ("IdeProductEndorsement"),
	CONSTRAINT "UK_SProductEndorsement_01" UNIQUE ("CodProductEndorsement")
);
CREATE INDEX "IX_SProductEndorsement_SEndorsement" ON ars_platform."SProductEndorsement" USING btree ("IdeEndorsement");
CREATE INDEX "IX_SProductEndorsement_SEndorsementReason" ON ars_platform."SProductEndorsement" USING btree ("IdeEndorsementReason");
CREATE INDEX "IX_SProductEndorsement_SProduct" ON ars_platform."SProductEndorsement" USING btree ("IdeProduct");
CREATE INDEX "IX_SProductEndorsement_SState" ON ars_platform."SProductEndorsement" USING btree ("IdeState");
CREATE INDEX "IX_SProductEndorsement_STextContent" ON ars_platform."SProductEndorsement" USING btree ("IdeTextContent");


-- ars_platform."SProductPaymentFraction" definition

-- Drop table

-- DROP TABLE ars_platform."SProductPaymentFraction";

CREATE TABLE ars_platform."SProductPaymentFraction" (
	"IdeProductPaymentFraction" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeProduct" uuid NOT NULL,
	"IdePaymentFraction" uuid NOT NULL,
	"TstInitial" date NOT NULL,
	"TstEnd" date NOT NULL,
	"PorSurCharge" numeric NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SProductPaymentFraction" PRIMARY KEY ("IdeProductPaymentFraction"),
	CONSTRAINT "UK_SProductPaymentFraction" UNIQUE ("IdeProduct", "IdePaymentFraction")
);
CREATE INDEX "IX_SProductPaymentFraction_SPaymentFraction" ON ars_platform."SProductPaymentFraction" USING btree ("IdePaymentFraction");
CREATE INDEX "IX_SProductPaymentFraction_SProduct" ON ars_platform."SProductPaymentFraction" USING btree ("IdeProduct");
CREATE INDEX "IX_SProductPaymentFraction_SState" ON ars_platform."SProductPaymentFraction" USING btree ("IdeState");


-- ars_platform."SProductProcessFlow" definition

-- Drop table

-- DROP TABLE ars_platform."SProductProcessFlow";

CREATE TABLE ars_platform."SProductProcessFlow" (
	"IdeProductProcessFlow" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodProductProcessFlow" varchar(30) NOT NULL,
	"DesProductProcessFlow" varchar(200) NOT NULL,
	"IdeProcessFlow" uuid NOT NULL,
	"IdeProduct" uuid NOT NULL,
	"IdeRiskProduct" uuid NULL,
	"IdeDistributionChannel" uuid NOT NULL,
	"IdeDistributionWay" uuid NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SProductProcessFlow" PRIMARY KEY ("IdeProductProcessFlow"),
	CONSTRAINT "UK_SProductProcessFlow_01" UNIQUE ("CodProductProcessFlow")
);
CREATE INDEX "IX_SProductProcessFlow_SDistributionChannel" ON ars_platform."SProductProcessFlow" USING btree ("IdeDistributionChannel");
CREATE INDEX "IX_SProductProcessFlow_SDistributionWay" ON ars_platform."SProductProcessFlow" USING btree ("IdeDistributionWay");
CREATE INDEX "IX_SProductProcessFlow_SProcessFlow" ON ars_platform."SProductProcessFlow" USING btree ("IdeProcessFlow");
CREATE INDEX "IX_SProductProcessFlow_SProduct" ON ars_platform."SProductProcessFlow" USING btree ("IdeProduct");
CREATE INDEX "IX_SProductProcessFlow_SRiskProduct" ON ars_platform."SProductProcessFlow" USING btree ("IdeRiskProduct");
CREATE INDEX "IX_SProductProcessFlow_SState" ON ars_platform."SProductProcessFlow" USING btree ("IdeState");
CREATE INDEX "IX_SProductProcessFlow_STextContent" ON ars_platform."SProductProcessFlow" USING btree ("IdeTextContent");


-- ars_platform."SProductRequirement" definition

-- Drop table

-- DROP TABLE ars_platform."SProductRequirement";

CREATE TABLE ars_platform."SProductRequirement" (
	"IdeProductRequirement" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeProcess" uuid NOT NULL,
	"IdeOperation" uuid NULL,
	"IdeProduct" uuid NOT NULL,
	"IdePlanProduct" uuid NULL,
	"IdeRiskProduct" uuid NULL,
	"IdeCoveragePlan" uuid NULL,
	"IdeCoverageGuarantee" uuid NULL,
	"IdeClaimType" uuid NULL,
	"IdeClaimEvent" uuid NULL,
	"IdeRequirement" uuid NOT NULL,
	"DesShort" varchar(150) NULL,
	"DesLarge" varchar NULL,
	"IndMandatory" bool NOT NULL,
	"IndReviewable" bool NOT NULL,
	"CodRequirementType" varchar(15) NOT NULL,
	"CodDocumentType" varchar(50) NOT NULL,
	"IndApplyOCR" bool NOT NULL,
	"Order" int4 NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SProductRequirement" PRIMARY KEY ("IdeProductRequirement"),
	CONSTRAINT "UK_SProductRequirement_01" UNIQUE ("IdeProcess", "IdeProduct", "IdeRequirement")
);
CREATE INDEX "IX_SProductRequirement_SClaimEvent" ON ars_platform."SProductRequirement" USING btree ("IdeClaimEvent");
CREATE INDEX "IX_SProductRequirement_SClaimType" ON ars_platform."SProductRequirement" USING btree ("IdeClaimType");
CREATE INDEX "IX_SProductRequirement_SCoverageGuarantee" ON ars_platform."SProductRequirement" USING btree ("IdeCoverageGuarantee");
CREATE INDEX "IX_SProductRequirement_SCoveragePlan" ON ars_platform."SProductRequirement" USING btree ("IdeCoveragePlan");
CREATE INDEX "IX_SProductRequirement_SOperation" ON ars_platform."SProductRequirement" USING btree ("IdeOperation");
CREATE INDEX "IX_SProductRequirement_SPlanProduct" ON ars_platform."SProductRequirement" USING btree ("IdePlanProduct");
CREATE INDEX "IX_SProductRequirement_SProcess" ON ars_platform."SProductRequirement" USING btree ("IdeProcess");
CREATE INDEX "IX_SProductRequirement_SProduct" ON ars_platform."SProductRequirement" USING btree ("IdeProduct");
CREATE INDEX "IX_SProductRequirement_SRequirement" ON ars_platform."SProductRequirement" USING btree ("IdeRequirement");
CREATE INDEX "IX_SProductRequirement_SRiskProduct" ON ars_platform."SProductRequirement" USING btree ("IdeRiskProduct");
CREATE INDEX "IX_SProductRequirement_SState" ON ars_platform."SProductRequirement" USING btree ("IdeState");
CREATE INDEX "IX_SProductRequirement_STextContent" ON ars_platform."SProductRequirement" USING btree ("IdeTextContent");


-- ars_platform."SProductValidityType" definition

-- Drop table

-- DROP TABLE ars_platform."SProductValidityType";

CREATE TABLE ars_platform."SProductValidityType" (
	"IdeProductValidityType" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeProduct" uuid NOT NULL,
	"IdeValidityType" uuid NOT NULL,
	"IndInitialDate" bool NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SProductValidityType" PRIMARY KEY ("IdeProductValidityType"),
	CONSTRAINT "UK_SProductValidityType_01" UNIQUE ("IdeProduct", "IdeValidityType")
);
CREATE INDEX "IX_SProductValidityType_SProduct" ON ars_platform."SProductValidityType" USING btree ("IdeProduct");
CREATE INDEX "IX_SProductValidityType_SState" ON ars_platform."SProductValidityType" USING btree ("IdeState");
CREATE INDEX "IX_SProductValidityType_SValidityType" ON ars_platform."SProductValidityType" USING btree ("IdeValidityType");


-- ars_platform."SProfession" definition

-- Drop table

-- DROP TABLE ars_platform."SProfession";

CREATE TABLE ars_platform."SProfession" (
	"IdeProfession" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodProfession" varchar(30) NOT NULL,
	"DesProfession" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SProfession" PRIMARY KEY ("IdeProfession"),
	CONSTRAINT "UK_SProfession_01" UNIQUE ("CodProfession")
);
CREATE INDEX "IX_SProfession_SState" ON ars_platform."SProfession" USING btree ("IdeState");
CREATE INDEX "IX_SProfession_STextContent" ON ars_platform."SProfession" USING btree ("IdeTextContent");


-- ars_platform."SRateFactor" definition

-- Drop table

-- DROP TABLE ars_platform."SRateFactor";

CREATE TABLE ars_platform."SRateFactor" (
	"IdeRateFactor" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeRateTable" uuid NOT NULL,
	"IdeFieldDictionary" uuid NULL,
	"NumOrder" int4 NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SRateFactor" PRIMARY KEY ("IdeRateFactor")
);
CREATE INDEX "IX_SRateFactor_SFieldDictionary" ON ars_platform."SRateFactor" USING btree ("IdeFieldDictionary");
CREATE INDEX "IX_SRateFactor_SRateTable" ON ars_platform."SRateFactor" USING btree ("IdeRateTable");
CREATE INDEX "IX_SRateFactor_SState" ON ars_platform."SRateFactor" USING btree ("IdeState");


-- ars_platform."SRateTable" definition

-- Drop table

-- DROP TABLE ars_platform."SRateTable";

CREATE TABLE ars_platform."SRateTable" (
	"IdeRateTable" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodRateTable" varchar(30) NOT NULL,
	"DesRateTable" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SRateTable" PRIMARY KEY ("IdeRateTable"),
	CONSTRAINT "UK_SRateTable_01" UNIQUE ("CodRateTable")
);
CREATE INDEX "IX_SRateTable_SState" ON ars_platform."SRateTable" USING btree ("IdeState");
CREATE INDEX "IX_SRateTable_STextContent" ON ars_platform."SRateTable" USING btree ("IdeTextContent");


-- ars_platform."SRateValue" definition

-- Drop table

-- DROP TABLE ars_platform."SRateValue";

CREATE TABLE ars_platform."SRateValue" (
	"IdeRateValue" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeRateTable" uuid NULL,
	"TstInit" timestamp NOT NULL,
	"TstEnd" timestamp NOT NULL,
	"Factor1" varchar NULL,
	"Factor2" varchar NULL,
	"Factor3" varchar NULL,
	"Factor4" varchar NULL,
	"Factor5" varchar NULL,
	"Value" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SRateValue" PRIMARY KEY ("IdeRateValue")
);
CREATE INDEX "IX_SRateValue_SRateTable" ON ars_platform."SRateValue" USING btree ("IdeRateTable");
CREATE INDEX "IX_SRateValue_SState" ON ars_platform."SRateValue" USING btree ("IdeState");


-- ars_platform."SReceiptType" definition

-- Drop table

-- DROP TABLE ars_platform."SReceiptType";

CREATE TABLE ars_platform."SReceiptType" (
	"IdeReceiptType" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodReceiptType" varchar(30) NOT NULL,
	"DesReceiptType" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SReceiptType" PRIMARY KEY ("IdeReceiptType"),
	CONSTRAINT "UK_SReceiptType_01" UNIQUE ("CodReceiptType")
);
CREATE INDEX "IX_SReceiptType_SState" ON ars_platform."SReceiptType" USING btree ("IdeState");
CREATE INDEX "IX_SReceiptType_STextContent" ON ars_platform."SReceiptType" USING btree ("IdeTextContent");


-- ars_platform."SRelationship" definition

-- Drop table

-- DROP TABLE ars_platform."SRelationship";

CREATE TABLE ars_platform."SRelationship" (
	"IdeRelationship" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodRelationship" varchar(30) NOT NULL,
	"DesRelationship" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SRelationship" PRIMARY KEY ("IdeRelationship"),
	CONSTRAINT "UK_SRelationship_01" UNIQUE ("CodRelationship")
);
CREATE INDEX "IX_SRelationship_SState" ON ars_platform."SRelationship" USING btree ("IdeState");
CREATE INDEX "IX_SRelationship_STextContent" ON ars_platform."SRelationship" USING btree ("IdeTextContent");


-- ars_platform."SRequirement" definition

-- Drop table

-- DROP TABLE ars_platform."SRequirement";

CREATE TABLE ars_platform."SRequirement" (
	"IdeRequirement" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodRequirement" varchar(30) NOT NULL,
	"DesRequirement" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SRequirement" PRIMARY KEY ("IdeRequirement"),
	CONSTRAINT "UK_SRequirement_01" UNIQUE ("CodRequirement")
);
CREATE INDEX "IX_SRequirement_SState" ON ars_platform."SRequirement" USING btree ("IdeState");
CREATE INDEX "IX_SRequirement_STextContent" ON ars_platform."SRequirement" USING btree ("IdeTextContent");


-- ars_platform."SRisk" definition

-- Drop table

-- DROP TABLE ars_platform."SRisk";

CREATE TABLE ars_platform."SRisk" (
	"IdeRisk" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodRisk" varchar(30) NOT NULL,
	"DesRisk" varchar(200) NOT NULL,
	"IdeRiskLevel" uuid NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SRisk" PRIMARY KEY ("IdeRisk"),
	CONSTRAINT "UK_SRisk_01" UNIQUE ("CodRisk")
);
CREATE INDEX "IX_SRisk_SState" ON ars_platform."SRisk" USING btree ("IdeState");
CREATE INDEX "IX_SRisk_STextContent" ON ars_platform."SRisk" USING btree ("IdeTextContent");


-- ars_platform."SRiskLevel" definition

-- Drop table

-- DROP TABLE ars_platform."SRiskLevel";

CREATE TABLE ars_platform."SRiskLevel" (
	"IdeRiskLevel" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodRiskLevel" varchar(30) NOT NULL,
	"DesRiskLevel" varchar(200) NOT NULL,
	"DesShort" varchar(150) NULL,
	"DesLarge" varchar NULL,
	"IdeRiskLevelParent" uuid NULL,
	"Order" int4 NULL,
	"Image" text NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SRiskLevel" PRIMARY KEY ("IdeRiskLevel"),
	CONSTRAINT "UK_SRiskLevel_01" UNIQUE ("CodRiskLevel")
);
CREATE INDEX "IX_SRiskLevel_SRiskLevel" ON ars_platform."SRiskLevel" USING btree ("IdeRiskLevelParent");
CREATE INDEX "IX_SRiskLevel_SState" ON ars_platform."SRiskLevel" USING btree ("IdeState");
CREATE INDEX "IX_SRiskLevel_STextContent" ON ars_platform."SRiskLevel" USING btree ("IdeTextContent");
CREATE INDEX "IX_SRisk_SRiskLevel" ON ars_platform."SRiskLevel" USING btree ("IdeRiskLevel");


-- ars_platform."SRiskProduct" definition

-- Drop table

-- DROP TABLE ars_platform."SRiskProduct";

CREATE TABLE ars_platform."SRiskProduct" (
	"IdeRiskProduct" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodRiskProduct" varchar(30) NOT NULL,
	"DesShort" varchar(150) NULL,
	"DesLarge" varchar NULL,
	"Image" text NULL,
	"IdeProduct" uuid NOT NULL,
	"IdeRisk" uuid NOT NULL,
	"IdeRiskType" uuid NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SRiskProduct" PRIMARY KEY ("IdeRiskProduct"),
	CONSTRAINT "UK_SRiskProduct_01" UNIQUE ("CodRiskProduct")
);
CREATE INDEX "IX_SRiskProduct_SProduct" ON ars_platform."SRiskProduct" USING btree ("IdeProduct");
CREATE INDEX "IX_SRiskProduct_SRisk" ON ars_platform."SRiskProduct" USING btree ("IdeRisk");
CREATE INDEX "IX_SRiskProduct_SRiskType" ON ars_platform."SRiskProduct" USING btree ("IdeRiskType");
CREATE INDEX "IX_SRiskProduct_SState" ON ars_platform."SRiskProduct" USING btree ("IdeState");
CREATE INDEX "IX_SRiskProduct_STextContent" ON ars_platform."SRiskProduct" USING btree ("IdeTextContent");


-- ars_platform."SRiskProductMapping" definition

-- Drop table

-- DROP TABLE ars_platform."SRiskProductMapping";

CREATE TABLE ars_platform."SRiskProductMapping" (
	"IdeRiskProductMapping" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodRiskProduct" varchar(30) NOT NULL,
	"Mapping" json NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SRiskProductMapping" PRIMARY KEY ("IdeRiskProductMapping")
);
CREATE INDEX "IX_SRiskProductMapping_SRiskProduct" ON ars_platform."SRiskProductMapping" USING btree ("CodRiskProduct");


-- ars_platform."SRiskType" definition

-- Drop table

-- DROP TABLE ars_platform."SRiskType";

CREATE TABLE ars_platform."SRiskType" (
	"IdeRiskType" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodRiskType" varchar(30) NOT NULL,
	"DesRiskType" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SRiskType" PRIMARY KEY ("IdeRiskType"),
	CONSTRAINT "UK_SRiskType_01" UNIQUE ("CodRiskType")
);
CREATE INDEX "IX_SRiskType_SState" ON ars_platform."SRiskType" USING btree ("IdeState");
CREATE INDEX "IX_SRiskType_STextContent" ON ars_platform."SRiskType" USING btree ("IdeTextContent");


-- ars_platform."SScreen" definition

-- Drop table

-- DROP TABLE ars_platform."SScreen";

CREATE TABLE ars_platform."SScreen" (
	"IdeScreen" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodScreen" varchar(60) NOT NULL,
	"DesScreen" varchar NOT NULL,
	"ScreenContent" json NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SScreen" PRIMARY KEY ("IdeScreen"),
	CONSTRAINT "UK_SScreen_01" UNIQUE ("CodScreen")
);
CREATE INDEX "IX_SScreen_SState" ON ars_platform."SScreen" USING btree ("IdeState");


-- ars_platform."SSiteMap" definition

-- Drop table

-- DROP TABLE ars_platform."SSiteMap";

CREATE TABLE ars_platform."SSiteMap" (
	"IdeSiteMap" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodSiteMap" varchar(30) NOT NULL,
	"DesSiteMap" varchar(200) NOT NULL,
	"IdeSiteMapParent" uuid NULL,
	"DesPathOption" varchar NULL,
	"Image" varchar NULL,
	"NumOrder" numeric NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SSiteMap" PRIMARY KEY ("IdeSiteMap"),
	CONSTRAINT "UK_SSiteMap_01" UNIQUE ("CodSiteMap")
);
CREATE INDEX "IX_SSiteMap_SSiteMap" ON ars_platform."SSiteMap" USING btree ("IdeSiteMapParent");


-- ars_platform."SSiteMapRole" definition

-- Drop table

-- DROP TABLE ars_platform."SSiteMapRole";

CREATE TABLE ars_platform."SSiteMapRole" (
	"IdeSiteMapRole" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeSiteMap" uuid NOT NULL,
	"IdeApplicationRole" uuid NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SSiteMapRole" PRIMARY KEY ("IdeSiteMapRole"),
	CONSTRAINT "UK_SSiteMapRole_01" UNIQUE ("IdeSiteMap", "IdeApplicationRole")
);
CREATE INDEX "IX_SSiteMapRole_SApplicationRole" ON ars_platform."SSiteMapRole" USING btree ("IdeApplicationRole");
CREATE INDEX "IX_SSiteMapRole_SSiteMap" ON ars_platform."SSiteMapRole" USING btree ("IdeSiteMap");
CREATE INDEX "IX_SSiteMapRole_SState" ON ars_platform."SSiteMapRole" USING btree ("IdeState");


-- ars_platform."SState" definition

-- Drop table

-- DROP TABLE ars_platform."SState";

CREATE TABLE ars_platform."SState" (
	"IdeState" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodState" varchar(30) NOT NULL,
	"DesState" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SState" PRIMARY KEY ("IdeState"),
	CONSTRAINT "UK_SState_01" UNIQUE ("CodState")
);
CREATE INDEX "IX_SState_STextContent" ON ars_platform."SState" USING btree ("IdeTextContent");


-- ars_platform."SStateRule" definition

-- Drop table

-- DROP TABLE ars_platform."SStateRule";

CREATE TABLE ars_platform."SStateRule" (
	"IdeStateRule" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeEntity" uuid NOT NULL,
	"IdeStateFrom" uuid NOT NULL,
	"IdeStateTo" uuid NOT NULL,
	"IndInitialState" bool NOT NULL,
	"DesOperativeCode" varchar(30) NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SStateRule" PRIMARY KEY ("IdeStateRule"),
	CONSTRAINT "UK_SStateRule_01" UNIQUE ("IdeEntity", "IdeStateFrom", "IdeStateTo", "DesOperativeCode")
);
CREATE INDEX "IX_SStateRuleFrom_SState" ON ars_platform."SStateRule" USING btree ("IdeStateFrom");
CREATE INDEX "IX_SStateRuleTo_SState" ON ars_platform."SStateRule" USING btree ("IdeStateTo");
CREATE INDEX "IX_SStateRule_SEntity" ON ars_platform."SStateRule" USING btree ("IdeEntity");
CREATE INDEX "IX_SStateRule_SState" ON ars_platform."SStateRule" USING btree ("IdeState");


-- ars_platform."SStep" definition

-- Drop table

-- DROP TABLE ars_platform."SStep";

CREATE TABLE ars_platform."SStep" (
	"IdeStep" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodStep" varchar(30) NOT NULL,
	"DesStep" varchar(200) NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SStep" PRIMARY KEY ("IdeStep"),
	CONSTRAINT "UK_SStep_01" UNIQUE ("CodStep")
);
CREATE INDEX "IX_SStep_SState" ON ars_platform."SStep" USING btree ("IdeState");
CREATE INDEX "IX_SStep_STextContent" ON ars_platform."SStep" USING btree ("IdeTextContent");


-- ars_platform."STextContent" definition

-- Drop table

-- DROP TABLE ars_platform."STextContent";

CREATE TABLE ars_platform."STextContent" (
	"IdeTextContent" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeLanguage" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_STextContent" PRIMARY KEY ("IdeTextContent"),
	CONSTRAINT "UK_STextContent_01" UNIQUE ("IdeLanguage")
);
CREATE INDEX "IX_STextContent_SLanguage" ON ars_platform."STextContent" USING btree ("IdeLanguage");
CREATE INDEX "IX_STextContent_SState" ON ars_platform."STextContent" USING btree ("IdeState");


-- ars_platform."STranslator" definition

-- Drop table

-- DROP TABLE ars_platform."STranslator";

CREATE TABLE ars_platform."STranslator" (
	"IdeTranslator" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeTextContent" uuid NOT NULL,
	"IdeLanguage" uuid NOT NULL,
	"DesTranslation" varchar(200) NOT NULL,
	"DesTranslationShort" varchar(200) NULL,
	"DesTranslationLarge" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_STranslator" PRIMARY KEY ("IdeTranslator"),
	CONSTRAINT "UK_STranslator_01" UNIQUE ("IdeTextContent", "IdeLanguage")
);
CREATE INDEX "IX_STranslator_SLanguage" ON ars_platform."STranslator" USING btree ("IdeLanguage");
CREATE INDEX "IX_STranslator_SState" ON ars_platform."STranslator" USING btree ("IdeState");
CREATE INDEX "IX_STranslator_STextContent" ON ars_platform."STranslator" USING btree ("IdeTextContent");


-- ars_platform."SValidityType" definition

-- Drop table

-- DROP TABLE ars_platform."SValidityType";

CREATE TABLE ars_platform."SValidityType" (
	"IdeValidityType" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodValidityType" varchar(30) NOT NULL,
	"DesValidityType" varchar(200) NOT NULL,
	"IndAnnual" bool NOT NULL,
	"IdeTextContent" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SValidityType" PRIMARY KEY ("IdeValidityType"),
	CONSTRAINT "UK_SValidityType_01" UNIQUE ("CodValidityType")
);
CREATE INDEX "IX_SValidityType_SState" ON ars_platform."SValidityType" USING btree ("IdeState");
CREATE INDEX "IX_SValidityType_STextContent" ON ars_platform."SValidityType" USING btree ("IdeTextContent");


-- ars_platform."TAddress" definition

-- Drop table

-- DROP TABLE ars_platform."TAddress";

CREATE TABLE ars_platform."TAddress" (
	"IdeAddress" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdePerson" uuid NOT NULL,
	"DesAddressLine1" varchar NOT NULL,
	"DesAddressLine2" varchar NULL,
	"IdeCountry" uuid NULL,
	"CodPostal" varchar(15) NOT NULL,
	"IndMain" bool NOT NULL,
	"Latitude" varchar NULL,
	"Longitude" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TLocation" PRIMARY KEY ("IdeAddress")
);
CREATE INDEX "IX_TAddress_SCountry" ON ars_platform."TAddress" USING btree ("IdeCountry");
CREATE INDEX "IX_TAddress_SState" ON ars_platform."TAddress" USING btree ("IdeState");
CREATE INDEX "IX_TAddress_TPerson" ON ars_platform."TAddress" USING btree ("IdePerson");


-- ars_platform."TApproval" definition

-- Drop table

-- DROP TABLE ars_platform."TApproval";

CREATE TABLE ars_platform."TApproval" (
	"IdeApproval" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeClaimFile" uuid NOT NULL,
	"NumApproval" varchar(30) NOT NULL,
	"IdePaymentType" uuid NOT NULL,
	"IdePersonPayment" uuid NOT NULL,
	"TstApproval" timestamp NOT NULL,
	"TstSending" timestamp NOT NULL,
	"TstPayment" timestamp NOT NULL,
	"DesObservation" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TApproval" PRIMARY KEY ("IdeApproval"),
	CONSTRAINT "UK_TApproval_01" UNIQUE ("NumApproval")
);
CREATE INDEX "IX_TApproval_SPaymentType" ON ars_platform."TApproval" USING btree ("IdePaymentType");
CREATE INDEX "IX_TApproval_SState" ON ars_platform."TApproval" USING btree ("IdeState");
CREATE INDEX "IX_TApproval_TClaimFile" ON ars_platform."TApproval" USING btree ("IdeClaimFile");
CREATE INDEX "IX_TApproval_TPerson" ON ars_platform."TApproval" USING btree ("IdePersonPayment");


-- ars_platform."TApprovalDetail" definition

-- Drop table

-- DROP TABLE ars_platform."TApprovalDetail";

CREATE TABLE ars_platform."TApprovalDetail" (
	"IdeApprovalDetail" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeApproval" uuid NOT NULL,
	"IdeCoverageProvision" uuid NOT NULL,
	"ApprovedAmount" numeric NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TApprovalDetail" PRIMARY KEY ("IdeApprovalDetail"),
	CONSTRAINT "UK_TApprovalDetail_01" UNIQUE ("IdeApproval", "IdeCoverageProvision")
);
CREATE INDEX "IX_TApprovalDetail_SState" ON ars_platform."TApprovalDetail" USING btree ("IdeState");
CREATE INDEX "IX_TApprovalDetail_TApproval" ON ars_platform."TApprovalDetail" USING btree ("IdeApproval");
CREATE INDEX "IX_TApprovalDetail_TCoverageProvision" ON ars_platform."TApprovalDetail" USING btree ("IdeCoverageProvision");


-- ars_platform."TBroker" definition

-- Drop table

-- DROP TABLE ars_platform."TBroker";

CREATE TABLE ars_platform."TBroker" (
	"IdeBroker" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodBroker" varchar(30) NOT NULL,
	"DesBroker" varchar(200) NOT NULL,
	"IdeBrokerType" uuid NOT NULL,
	"IdePerson" uuid NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TBroker" PRIMARY KEY ("IdeBroker"),
	CONSTRAINT "UK_TBroker_01" UNIQUE ("CodBroker")
);
CREATE INDEX "IX_TBroker_SBrokerType" ON ars_platform."TBroker" USING btree ("IdeBrokerType");
CREATE INDEX "IX_TBroker_SState" ON ars_platform."TBroker" USING btree ("IdeState");
CREATE INDEX "IX_TBroker_TPerson" ON ars_platform."TBroker" USING btree ("IdePerson");


-- ars_platform."TClaim" definition

-- Drop table

-- DROP TABLE ars_platform."TClaim";

CREATE TABLE ars_platform."TClaim" (
	"IdeClaim" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeClaimType" uuid NOT NULL,
	"IdeContractFile" uuid NOT NULL,
	"NumClaim" varchar(30) NOT NULL,
	"TstOcurrence" timestamp NOT NULL,
	"TstNotification" timestamp NOT NULL,
	"TstConstitution" timestamp NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TClaim" PRIMARY KEY ("IdeClaim"),
	CONSTRAINT "UK_TClaim_01" UNIQUE ("NumClaim")
);
CREATE INDEX "IX_TClaim_SClaimType" ON ars_platform."TClaim" USING btree ("IdeClaimType");
CREATE INDEX "IX_TClaim_SState" ON ars_platform."TClaim" USING btree ("IdeState");
CREATE INDEX "IX_TClaim_TContractFile" ON ars_platform."TClaim" USING btree ("IdeContractFile");


-- ars_platform."TClaimFile" definition

-- Drop table

-- DROP TABLE ars_platform."TClaimFile";

CREATE TABLE ars_platform."TClaimFile" (
	"IdeClaimFile" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeClaim" uuid NOT NULL,
	"IdeClaimEvent" uuid NOT NULL,
	"IdeCurrency" uuid NOT NULL,
	"NumClaimFile" varchar(30) NOT NULL,
	"DesLarge" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TClaimFile" PRIMARY KEY ("IdeClaimFile"),
	CONSTRAINT "UK_TClaimFile_01" UNIQUE ("NumClaimFile")
);
CREATE INDEX "IX_TClaimFile_SClaimEvent" ON ars_platform."TClaimFile" USING btree ("IdeClaimEvent");
CREATE INDEX "IX_TClaimFile_SCurrency" ON ars_platform."TClaimFile" USING btree ("IdeCurrency");
CREATE INDEX "IX_TClaimFile_SState" ON ars_platform."TClaimFile" USING btree ("IdeState");
CREATE INDEX "IX_TClaimFile_TClaim" ON ars_platform."TClaimFile" USING btree ("IdeClaim");


-- ars_platform."TClaimOperation" definition

-- Drop table

-- DROP TABLE ars_platform."TClaimOperation";

CREATE TABLE ars_platform."TClaimOperation" (
	"IdeClaimOperation" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeClaim" uuid NOT NULL,
	"IdeOperationProduct" uuid NOT NULL,
	"NumOperation" int4 NOT NULL,
	"TstRequest" timestamp NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TClaimOperation" PRIMARY KEY ("IdeClaimOperation"),
	CONSTRAINT "UK_TClaimOperation_01" UNIQUE ("IdeClaim", "IdeOperationProduct")
);
CREATE INDEX "IX_TClaimOperation_SOperationProduct" ON ars_platform."TClaimOperation" USING btree ("IdeOperationProduct");
CREATE INDEX "IX_TClaimOperation_SState" ON ars_platform."TClaimOperation" USING btree ("IdeState");
CREATE INDEX "IX_TClaimOperation_TClaim" ON ars_platform."TClaimOperation" USING btree ("IdeClaim");


-- ars_platform."TClaimRequirement" definition

-- Drop table

-- DROP TABLE ars_platform."TClaimRequirement";

CREATE TABLE ars_platform."TClaimRequirement" (
	"IdeClaimRequirement" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeClaimFile" uuid NOT NULL,
	"IdeClaimRisk" uuid NOT NULL,
	"IdeProductRequirement" uuid NOT NULL,
	"TstRequest" timestamp NOT NULL,
	"TstReception" timestamp NOT NULL,
	"IdeStateReview" uuid NOT NULL,
	"DesLargeReview" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TClaimRequirement" PRIMARY KEY ("IdeClaimRequirement"),
	CONSTRAINT "UK_TClaimRequirement_01" UNIQUE ("IdeClaimFile", "IdeClaimRisk", "IdeProductRequirement")
);
CREATE INDEX "IX_TClaimRequirement_SProductRequirement" ON ars_platform."TClaimRequirement" USING btree ("IdeProductRequirement");
CREATE INDEX "IX_TClaimRequirement_SState" ON ars_platform."TClaimRequirement" USING btree ("IdeState");
CREATE INDEX "IX_TClaimRequirement_TClaimFile" ON ars_platform."TClaimRequirement" USING btree ("IdeClaimFile");
CREATE INDEX "IX_TClaimRequirement_TClaimRisk" ON ars_platform."TClaimRequirement" USING btree ("IdeClaimRisk");


-- ars_platform."TClaimRisk" definition

-- Drop table

-- DROP TABLE ars_platform."TClaimRisk";

CREATE TABLE ars_platform."TClaimRisk" (
	"IdeClaimRisk" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeClaimFile" uuid NOT NULL,
	"IdeFileRisk" uuid NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TClaimRisk" PRIMARY KEY ("IdeClaimRisk"),
	CONSTRAINT "UK_TClaimRisk_01" UNIQUE ("IdeClaimFile", "IdeFileRisk")
);
CREATE INDEX "IX_TClaimRisk_SState" ON ars_platform."TClaimRisk" USING btree ("IdeState");
CREATE INDEX "IX_TClaimRisk_TClaimFile" ON ars_platform."TClaimRisk" USING btree ("IdeClaimFile");
CREATE INDEX "IX_TClaimRisk_TFileRisk" ON ars_platform."TClaimRisk" USING btree ("IdeFileRisk");


-- ars_platform."TContactData" definition

-- Drop table

-- DROP TABLE ars_platform."TContactData";

CREATE TABLE ars_platform."TContactData" (
	"IdeContactData" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdePerson" uuid NOT NULL,
	"IdeContactClass" uuid NOT NULL,
	"DesContactData" varchar(200) NOT NULL,
	"IndMain" bool NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TContactData" PRIMARY KEY ("IdeContactData"),
	CONSTRAINT "UK_TContactData_01" UNIQUE ("IdePerson", "IdeContactClass", "DesContactData")
);
CREATE INDEX "IX_TContactData_SContactClass" ON ars_platform."TContactData" USING btree ("IdeContactClass");
CREATE INDEX "IX_TContactData_SState" ON ars_platform."TContactData" USING btree ("IdeState");
CREATE INDEX "IX_TContactData_TPerson" ON ars_platform."TContactData" USING btree ("IdePerson");


-- ars_platform."TContract" definition

-- Drop table

-- DROP TABLE ars_platform."TContract";

CREATE TABLE ars_platform."TContract" (
	"IdeContract" uuid DEFAULT gen_random_uuid() NOT NULL,
	"NumContract" varchar(30) NOT NULL,
	"IdeQuote" uuid NOT NULL,
	"IdeProduct" uuid NOT NULL,
	"IdeDistributionChannelSale" uuid NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NULL,
	"TstSubscription" timestamp NOT NULL,
	"TstNextBilling" timestamp NULL,
	"TstCancellation" timestamp NULL,
	"DesCancellation" varchar NULL,
	"IndCollective" bool NOT NULL,
	"IdeValidityType" uuid NOT NULL,
	"ContractAge" int4 NOT NULL,
	"IndInternalBillingManagement" bool NOT NULL,
	"IdePaymentFraction" uuid NOT NULL,
	"NumExternalContract" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TContract" PRIMARY KEY ("IdeContract"),
	CONSTRAINT "UK_TContract_01" UNIQUE ("NumContract")
);
CREATE INDEX "IX_TContract_SDistributionChannel" ON ars_platform."TContract" USING btree ("IdeDistributionChannelSale");
CREATE INDEX "IX_TContract_SPaymentFraction" ON ars_platform."TContract" USING btree ("IdePaymentFraction");
CREATE INDEX "IX_TContract_SProduct" ON ars_platform."TContract" USING btree ("IdeProduct");
CREATE INDEX "IX_TContract_SState" ON ars_platform."TContract" USING btree ("IdeState");
CREATE INDEX "IX_TContract_SValidityType" ON ars_platform."TContract" USING btree ("IdeValidityType");
CREATE INDEX "IX_TContract_TQuote" ON ars_platform."TContract" USING btree ("IdeQuote");


-- ars_platform."TContractBilling" definition

-- Drop table

-- DROP TABLE ars_platform."TContractBilling";

CREATE TABLE ars_platform."TContractBilling" (
	"IdeContractBilling" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeContract" uuid NOT NULL,
	"NumPeriod" int4 NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TContractBilling" PRIMARY KEY ("IdeContractBilling"),
	CONSTRAINT "UK_TContractBilling_01" UNIQUE ("IdeContract", "NumPeriod")
);
CREATE INDEX "IX_TContractBilling_SState" ON ars_platform."TContractBilling" USING btree ("IdeState");
CREATE INDEX "IX_TContractBilling_TContract" ON ars_platform."TContractBilling" USING btree ("IdeContract");


-- ars_platform."TContractDistributionChannel" definition

-- Drop table

-- DROP TABLE ars_platform."TContractDistributionChannel";

CREATE TABLE ars_platform."TContractDistributionChannel" (
	"IdeContractDistributionChannel" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeContract" uuid NOT NULL,
	"IdeDistributionChannel" uuid NOT NULL,
	"Percentaje" numeric NOT NULL,
	"IndMain" bool NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NOT NULL,
	"NumMovement" int4 NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_SContractDistributionChannel" PRIMARY KEY ("IdeContractDistributionChannel")
);
CREATE INDEX "IX_TContractDistributionChannel_SState" ON ars_platform."TContractDistributionChannel" USING btree ("IdeState");
CREATE INDEX "IX_TContractDistributionChannel_TContract" ON ars_platform."TContractDistributionChannel" USING btree ("IdeContract");
CREATE INDEX "IX_TContractDistributionChannel_TDistributionChannel" ON ars_platform."TContractDistributionChannel" USING btree ("IdeDistributionChannel");


-- ars_platform."TContractFile" definition

-- Drop table

-- DROP TABLE ars_platform."TContractFile";

CREATE TABLE ars_platform."TContractFile" (
	"IdeContractFile" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeContract" uuid NOT NULL,
	"NumContractFile" int4 NOT NULL,
	"TstInclusion" timestamp NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NOT NULL,
	"TstCancellation" timestamp NULL,
	"DesCancellation" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TContractFile" PRIMARY KEY ("IdeContractFile"),
	CONSTRAINT "UK_TContractFile_01" UNIQUE ("IdeContract", "NumContractFile")
);
CREATE INDEX "IX_TContractFile_TContract" ON ars_platform."TContractFile" USING btree ("IdeContract");


-- ars_platform."TContractFilePerson" definition

-- Drop table

-- DROP TABLE ars_platform."TContractFilePerson";

CREATE TABLE ars_platform."TContractFilePerson" (
	"IdeContractFilePerson" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeContractFile" uuid NOT NULL,
	"IdePerson" uuid NOT NULL,
	"IdePersonRol" uuid NOT NULL,
	"ObjCustomData" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TContractFilePerson" PRIMARY KEY ("IdeContractFilePerson"),
	CONSTRAINT "UK_TContractFilePerson_01" UNIQUE ("IdeContractFile", "IdePerson", "IdePersonRol")
);
CREATE INDEX "IX_TContractFilePerson_SPersonRol" ON ars_platform."TContractFilePerson" USING btree ("IdePersonRol");
CREATE INDEX "IX_TContractFilePerson_SState" ON ars_platform."TContractFilePerson" USING btree ("IdeState");
CREATE INDEX "IX_TContractFilePerson_TContractFile" ON ars_platform."TContractFilePerson" USING btree ("IdeContractFile");
CREATE INDEX "IX_TContractFilePerson_TPerson" ON ars_platform."TContractFilePerson" USING btree ("IdePerson");


-- ars_platform."TContractOperation" definition

-- Drop table

-- DROP TABLE ars_platform."TContractOperation";

CREATE TABLE ars_platform."TContractOperation" (
	"IdeContractOperation" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeContract" uuid NOT NULL,
	"IdeOperationProduct" uuid NOT NULL,
	"NumOperation" int4 NOT NULL,
	"Data" json NULL,
	"TstRequest" timestamp NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TContractOperation" PRIMARY KEY ("IdeContractOperation"),
	CONSTRAINT "UK_TContractOperation_01" UNIQUE ("IdeContract", "IdeOperationProduct", "NumOperation")
);
CREATE INDEX "IX_TContractOperation_SOperationProduct" ON ars_platform."TContractOperation" USING btree ("IdeOperationProduct");
CREATE INDEX "IX_TContractOperation_SState" ON ars_platform."TContractOperation" USING btree ("IdeState");
CREATE INDEX "IX_TContractOperation_TContract" ON ars_platform."TContractOperation" USING btree ("IdeContract");


-- ars_platform."TContractOperationDocument" definition

-- Drop table

-- DROP TABLE ars_platform."TContractOperationDocument";

CREATE TABLE ars_platform."TContractOperationDocument" (
	"IdeContractOperationDocument" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeContractOperation" uuid NOT NULL,
	"DocumentData" json NULL,
	"TstRequest" timestamp NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TContractOperationDocument" PRIMARY KEY ("IdeContractOperationDocument")
);
CREATE INDEX "IX_TContractOperationDocument_SState" ON ars_platform."TContractOperationDocument" USING btree ("IdeState");
CREATE INDEX "IX_TContractOperationDocument_TContractOperation" ON ars_platform."TContractOperationDocument" USING btree ("IdeContractOperation");


-- ars_platform."TContractPerson" definition

-- Drop table

-- DROP TABLE ars_platform."TContractPerson";

CREATE TABLE ars_platform."TContractPerson" (
	"IdeContractPerson" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeContract" uuid NOT NULL,
	"IdePerson" uuid NOT NULL,
	"IdePersonRol" uuid NOT NULL,
	"ObjCustomData" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TContractPerson" PRIMARY KEY ("IdeContractPerson"),
	CONSTRAINT "UK_TContractPerson_01" UNIQUE ("IdeContract", "IdePerson", "IdePersonRol")
);
CREATE INDEX "IX_TContractPerson_SPersonRol" ON ars_platform."TContractPerson" USING btree ("IdePersonRol");
CREATE INDEX "IX_TContractPerson_SState" ON ars_platform."TContractPerson" USING btree ("IdeState");
CREATE INDEX "IX_TContractPerson_TContract" ON ars_platform."TContractPerson" USING btree ("IdeContract");
CREATE INDEX "IX_TContractPerson_TPerson" ON ars_platform."TContractPerson" USING btree ("IdePerson");


-- ars_platform."TContractRequirement" definition

-- Drop table

-- DROP TABLE ars_platform."TContractRequirement";

CREATE TABLE ars_platform."TContractRequirement" (
	"IdeContractRequirement" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeFileRisk" uuid NOT NULL,
	"IdeRiskCoverage" uuid NULL,
	"IdeProductRequirement" uuid NOT NULL,
	"Data" json NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TContractRequirement" PRIMARY KEY ("IdeContractRequirement")
);
CREATE INDEX "IX_TContractRequirement_SProductRequirement" ON ars_platform."TContractRequirement" USING btree ("IdeProductRequirement");
CREATE INDEX "IX_TContractRequirement_SState" ON ars_platform."TContractRequirement" USING btree ("IdeState");
CREATE INDEX "IX_TContractRequirement_TFileRisk" ON ars_platform."TContractRequirement" USING btree ("IdeFileRisk");
CREATE INDEX "IX_TContractRequirement_TRiskCoverage" ON ars_platform."TContractRequirement" USING btree ("IdeRiskCoverage");


-- ars_platform."TCoverageMovement" definition

-- Drop table

-- DROP TABLE ars_platform."TCoverageMovement";

CREATE TABLE ars_platform."TCoverageMovement" (
	"IdeCoverageMovement" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeRiskCoverage" uuid NOT NULL,
	"NumCoverageMovement" int4 NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NOT NULL,
	"Amount" numeric NOT NULL,
	"Rate" numeric NOT NULL,
	"Prime" numeric NOT NULL,
	"IdeContractOperation" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TCoverageMovement" PRIMARY KEY ("IdeCoverageMovement"),
	CONSTRAINT "UK_TCoverageMovement_01" UNIQUE ("IdeRiskCoverage", "NumCoverageMovement")
);
CREATE INDEX "IX_TCoverageMovement_SState" ON ars_platform."TCoverageMovement" USING btree ("IdeState");
CREATE INDEX "IX_TCoverageMovement_TContractOperation" ON ars_platform."TCoverageMovement" USING btree ("IdeContractOperation");
CREATE INDEX "IX_TCoverageMovement_TRiskCoverage" ON ars_platform."TCoverageMovement" USING btree ("IdeRiskCoverage");


-- ars_platform."TCoverageProvision" definition

-- Drop table

-- DROP TABLE ars_platform."TCoverageProvision";

CREATE TABLE ars_platform."TCoverageProvision" (
	"IdeCoverageProvision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeClaimRisk" uuid NOT NULL,
	"IdeRiskCoverage" uuid NOT NULL,
	"InvoicedAmount" numeric NOT NULL,
	"CoveredAmount" numeric NOT NULL,
	"ApprovedAmount" numeric NOT NULL,
	"IndemnifiedAmount" numeric NOT NULL,
	"NoCoveredAmount" numeric NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TCoverageProvision" PRIMARY KEY ("IdeCoverageProvision"),
	CONSTRAINT "UK_TCoverageProvision_01" UNIQUE ("IdeClaimRisk", "IdeRiskCoverage")
);
CREATE INDEX "IX_TCoverageProvision_SState" ON ars_platform."TCoverageProvision" USING btree ("IdeState");
CREATE INDEX "IX_TCoverageProvision_TClaimRisk" ON ars_platform."TCoverageProvision" USING btree ("IdeClaimRisk");
CREATE INDEX "IX_TCoverageProvision_TRiskCoverage" ON ars_platform."TCoverageProvision" USING btree ("IdeRiskCoverage");


-- ars_platform."TFileRisk" definition

-- Drop table

-- DROP TABLE ars_platform."TFileRisk";

CREATE TABLE ars_platform."TFileRisk" (
	"IdeFileRisk" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeContractFile" uuid NOT NULL,
	"NumFileRisk" int4 NOT NULL,
	"DesFileRisk" varchar(200) NULL,
	"IdeRiskProduct" uuid NOT NULL,
	"IdePlanProductRisk" uuid NOT NULL,
	"RiskAttributeValue" json NULL,
	"TstInclusion" timestamp NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NOT NULL,
	"TstCancellation" timestamp NULL,
	"DesCancellation" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TFileRisk" PRIMARY KEY ("IdeFileRisk"),
	CONSTRAINT "UK_TFileRisk_01" UNIQUE ("IdeContractFile", "NumFileRisk")
);
CREATE INDEX "IX_TFileRisk_SPlanProductRisk" ON ars_platform."TFileRisk" USING btree ("IdePlanProductRisk");
CREATE INDEX "IX_TFileRisk_SRiskProduct" ON ars_platform."TFileRisk" USING btree ("IdeRiskProduct");
CREATE INDEX "IX_TFileRisk_SState" ON ars_platform."TFileRisk" USING btree ("IdeState");
CREATE INDEX "IX_TFileRisk_TContractFile" ON ars_platform."TFileRisk" USING btree ("IdeContractFile");


-- ars_platform."TFileRiskPerson" definition

-- Drop table

-- DROP TABLE ars_platform."TFileRiskPerson";

CREATE TABLE ars_platform."TFileRiskPerson" (
	"IdeFileRiskPerson" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeFileRisk" uuid NOT NULL,
	"IdePerson" uuid NOT NULL,
	"IdePersonRol" uuid NOT NULL,
	"IdeRelationship" uuid NULL,
	"ObjCustomData" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TFileRiskPerson" PRIMARY KEY ("IdeFileRiskPerson"),
	CONSTRAINT "UK_TFileRiskPerson_01" UNIQUE ("IdeFileRisk", "IdePerson", "IdePersonRol")
);
CREATE INDEX "IX_TFileRiskPerson_SPersonRol" ON ars_platform."TFileRiskPerson" USING btree ("IdePersonRol");
CREATE INDEX "IX_TFileRiskPerson_SRelationship" ON ars_platform."TFileRiskPerson" USING btree ("IdeRelationship");
CREATE INDEX "IX_TFileRiskPerson_SState" ON ars_platform."TFileRiskPerson" USING btree ("IdeState");
CREATE INDEX "IX_TFileRiskPerson_TFileRisk" ON ars_platform."TFileRiskPerson" USING btree ("IdeFileRisk");
CREATE INDEX "IX_TFileRiskPerson_TPerson" ON ars_platform."TFileRiskPerson" USING btree ("IdePerson");


-- ars_platform."TFlowStepInstance" definition

-- Drop table

-- DROP TABLE ars_platform."TFlowStepInstance";

CREATE TABLE ars_platform."TFlowStepInstance" (
	"IdeFlowStepInstance" uuid DEFAULT gen_random_uuid() NOT NULL,
	"UIDSession" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeFlowStep" uuid NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NULL,
	"IndState" bool NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TFlowStepInstance" PRIMARY KEY ("IdeFlowStepInstance")
);
CREATE INDEX "IX_TFlowStepInstance_SFlowStep" ON ars_platform."TFlowStepInstance" USING btree ("IdeFlowStep");


-- ars_platform."TGuaranteeProvision" definition

-- Drop table

-- DROP TABLE ars_platform."TGuaranteeProvision";

CREATE TABLE ars_platform."TGuaranteeProvision" (
	"IdeGuaranteeProvision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeCoverageProvision" uuid NOT NULL,
	"IdeCoverageGuarantee" uuid NOT NULL,
	"InvoicedAmount" numeric NOT NULL,
	"CoveredAmount" numeric NOT NULL,
	"ApprovedAmount" numeric NOT NULL,
	"IndemnifiedAmount" numeric NOT NULL,
	"NoCoveredAmount" numeric NOT NULL,
	"ManualDeductibleAmount" numeric NULL,
	"NumApplyUse" numeric NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TGuaranteeProvision" PRIMARY KEY ("IdeGuaranteeProvision"),
	CONSTRAINT "UK_TGuaranteeProvision_01" UNIQUE ("IdeCoverageProvision", "IdeCoverageGuarantee")
);
CREATE INDEX "IX_TGuaranteeProvision_SCoverageGuarantee" ON ars_platform."TGuaranteeProvision" USING btree ("IdeCoverageGuarantee");
CREATE INDEX "IX_TGuaranteeProvision_SState" ON ars_platform."TGuaranteeProvision" USING btree ("IdeState");
CREATE INDEX "IX_TGuaranteeProvision_TCoverageProvision" ON ars_platform."TGuaranteeProvision" USING btree ("IdeCoverageProvision");


-- ars_platform."TMovementConcept" definition

-- Drop table

-- DROP TABLE ars_platform."TMovementConcept";

CREATE TABLE ars_platform."TMovementConcept" (
	"IdeMovementConcept" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeCoverageMovement" uuid NOT NULL,
	"IdeConcept" uuid NOT NULL,
	"ConceptValue" numeric NOT NULL,
	"ConceptNetValue" numeric NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TMovementConcept" PRIMARY KEY ("IdeMovementConcept"),
	CONSTRAINT "UK_TMovementConcept_01" UNIQUE ("IdeCoverageMovement", "IdeConcept")
);
CREATE INDEX "IX_TMovementConcept_SConcept" ON ars_platform."TMovementConcept" USING btree ("IdeConcept");
CREATE INDEX "IX_TMovementConcept_SState" ON ars_platform."TMovementConcept" USING btree ("IdeState");
CREATE INDEX "IX_TMovementConcept_TCoverageMovement" ON ars_platform."TMovementConcept" USING btree ("IdeCoverageMovement");


-- ars_platform."TPerson" definition

-- Drop table

-- DROP TABLE ars_platform."TPerson";

CREATE TABLE ars_platform."TPerson" (
	"IdePerson" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeIdentificationType" uuid NULL,
	"NumIdentification" varchar(60) NULL,
	"DesFirstName" varchar(30) NOT NULL,
	"DesMiddleName" varchar(30) NULL,
	"DesLastName1" varchar(30) NULL,
	"DesLastName2" varchar(30) NULL,
	"DesEmail" varchar(60) NOT NULL,
	"IdeGender" uuid NULL,
	"TstBirthdate" date NULL,
	"DesBirthPlace" varchar(60) NULL,
	"IdeCountryBirth" uuid NULL,
	"IdeLocationBirth" uuid NULL,
	"IdeProfession" uuid NULL,
	"IdeBusinessActivity" uuid NULL,
	"IdeMaritalStatus" uuid NULL,
	"IndLead" bool NOT NULL,
	"IndClient" bool NOT NULL,
	"TstRelationshipStart" timestamp NULL,
	"ObjCustomData" varchar NULL,
	"CodExternal" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TPerson" PRIMARY KEY ("IdePerson"),
	CONSTRAINT "UK_TPerson_01" UNIQUE ("IdeIdentificationType", "NumIdentification"),
	CONSTRAINT "UK_TPerson_02" UNIQUE ("DesEmail")
);
CREATE INDEX "IX_TPerson_SState" ON ars_platform."TPerson" USING btree ("IdeState");


-- ars_platform."TPersonConsent" definition

-- Drop table

-- DROP TABLE ars_platform."TPersonConsent";

CREATE TABLE ars_platform."TPersonConsent" (
	"IdePersonConsent" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeConsent" uuid NOT NULL,
	"IdePerson" uuid NOT NULL,
	"IdeQuote" uuid NULL,
	"IdeContractOperation" uuid NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TPersonConsent" PRIMARY KEY ("IdePersonConsent")
);
CREATE INDEX "IX_TPersonConsent_SConsent" ON ars_platform."TPersonConsent" USING btree ("IdeConsent");
CREATE INDEX "IX_TPersonConsent_SState" ON ars_platform."TPersonConsent" USING btree ("IdeState");
CREATE INDEX "IX_TPersonConsent_TContractOperation" ON ars_platform."TPersonConsent" USING btree ("IdeContractOperation");
CREATE INDEX "IX_TPersonConsent_TPerson" ON ars_platform."TPersonConsent" USING btree ("IdePerson");
CREATE INDEX "IX_TPersonConsent_TQuote" ON ars_platform."TPersonConsent" USING btree ("IdeQuote");


-- ars_platform."TQuote" definition

-- Drop table

-- DROP TABLE ars_platform."TQuote";

CREATE TABLE ars_platform."TQuote" (
	"IdeQuote" uuid DEFAULT gen_random_uuid() NOT NULL,
	"NumQuote" varchar(30) NOT NULL,
	"IdePerson" uuid NULL,
	"IdeDistributionChannel" uuid NOT NULL,
	"IdeProduct" uuid NOT NULL,
	"IdeDistributionWay" uuid NOT NULL,
	"TstQuote" timestamp NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TQuote" PRIMARY KEY ("IdeQuote"),
	CONSTRAINT "UK_TQuote_01" UNIQUE ("NumQuote")
);
CREATE INDEX "IX_TQuote_SDistributionChannel" ON ars_platform."TQuote" USING btree ("IdeDistributionChannel");
CREATE INDEX "IX_TQuote_SDistributionWay" ON ars_platform."TQuote" USING btree ("IdeDistributionWay");
CREATE INDEX "IX_TQuote_SProduct" ON ars_platform."TQuote" USING btree ("IdeProduct");
CREATE INDEX "IX_TQuote_SState" ON ars_platform."TQuote" USING btree ("IdeState");
CREATE INDEX "IX_TQuote_TPerson" ON ars_platform."TQuote" USING btree ("IdePerson");


-- ars_platform."TQuoteCoverage" definition

-- Drop table

-- DROP TABLE ars_platform."TQuoteCoverage";

CREATE TABLE ars_platform."TQuoteCoverage" (
	"IdeQuoteCoverage" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeQuoteRiskPlan" uuid NOT NULL,
	"IdeCoveragePlan" uuid NOT NULL,
	"Amount" numeric NOT NULL,
	"Rate" numeric NOT NULL,
	"Prime" numeric NOT NULL,
	"IndSelected" bool NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TQuoteCoverage" PRIMARY KEY ("IdeQuoteCoverage")
);
CREATE INDEX "IX_TQuoteCoverage_SCoveragePlan" ON ars_platform."TQuoteCoverage" USING btree ("IdeCoveragePlan");
CREATE INDEX "IX_TQuoteCoverage_SState" ON ars_platform."TQuoteCoverage" USING btree ("IdeState");
CREATE INDEX "IX_TQuoteCoverage_TQuoteRiskPlan" ON ars_platform."TQuoteCoverage" USING btree ("IdeQuoteRiskPlan");


-- ars_platform."TQuoteCoverageConcept" definition

-- Drop table

-- DROP TABLE ars_platform."TQuoteCoverageConcept";

CREATE TABLE ars_platform."TQuoteCoverageConcept" (
	"IdeQuoteCoverageConcept" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeQuoteCoverage" uuid NOT NULL,
	"IdeConcept" uuid NOT NULL,
	"ConceptValue" numeric NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TQuoteCoverageConcept" PRIMARY KEY ("IdeQuoteCoverageConcept")
);
CREATE INDEX "IX_TQuoteCoverageConcept_SConcept" ON ars_platform."TQuoteCoverageConcept" USING btree ("IdeConcept");
CREATE INDEX "IX_TQuoteCoverageConcept_SState" ON ars_platform."TQuoteCoverageConcept" USING btree ("IdeState");
CREATE INDEX "IX_TQuoteCoverageConcept_TQuoteCoverage" ON ars_platform."TQuoteCoverageConcept" USING btree ("IdeQuoteCoverage");


-- ars_platform."TQuoteOperation" definition

-- Drop table

-- DROP TABLE ars_platform."TQuoteOperation";

CREATE TABLE ars_platform."TQuoteOperation" (
	"IdeQuoteOperation" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeQuote" uuid NOT NULL,
	"IdeOperationProduct" uuid NOT NULL,
	"NumOperation" int4 NOT NULL,
	"TstRequest" timestamp NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TQuoteOperation" PRIMARY KEY ("IdeQuoteOperation"),
	CONSTRAINT "UK_TQuoteOperation_01" UNIQUE ("IdeQuote", "IdeOperationProduct")
);
CREATE INDEX "IX_TQuoteOperation_SOperationProduct" ON ars_platform."TQuoteOperation" USING btree ("IdeOperationProduct");
CREATE INDEX "IX_TQuoteOperation_SState" ON ars_platform."TQuoteOperation" USING btree ("IdeState");
CREATE INDEX "IX_TQuoteOperation_TQuote" ON ars_platform."TQuoteOperation" USING btree ("IdeQuote");


-- ars_platform."TQuotePerson" definition

-- Drop table

-- DROP TABLE ars_platform."TQuotePerson";

CREATE TABLE ars_platform."TQuotePerson" (
	"IdeQuotePerson" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeQuote" uuid NOT NULL,
	"IdePerson" uuid NOT NULL,
	"IdePersonRol" uuid NOT NULL,
	"ObjCustomData" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TQuotePerson" PRIMARY KEY ("IdeQuotePerson"),
	CONSTRAINT "UK_TQuotePerson_01" UNIQUE ("IdeQuote", "IdePerson", "IdePersonRol")
);
CREATE INDEX "IX_TQuotePerson_SPersonRol" ON ars_platform."TQuotePerson" USING btree ("IdePersonRol");
CREATE INDEX "IX_TQuotePerson_SState" ON ars_platform."TQuotePerson" USING btree ("IdeState");
CREATE INDEX "IX_TQuotePerson_TPerson" ON ars_platform."TQuotePerson" USING btree ("IdePerson");
CREATE INDEX "IX_TQuotePerson_TQuote" ON ars_platform."TQuotePerson" USING btree ("IdeQuote");


-- ars_platform."TQuoteRequirement" definition

-- Drop table

-- DROP TABLE ars_platform."TQuoteRequirement";

CREATE TABLE ars_platform."TQuoteRequirement" (
	"IdeQuoteRequirement" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeQuoteRisk" uuid NOT NULL,
	"IdeQuoteRiskPlan" uuid NULL,
	"IdeQuoteCoverage" uuid NULL,
	"IdeProductRequirement" uuid NOT NULL,
	"Data" json NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TQuoteRequirement" PRIMARY KEY ("IdeQuoteRequirement")
);
CREATE INDEX "IX_TQuoteRequirement_SProductRequirement" ON ars_platform."TQuoteRequirement" USING btree ("IdeProductRequirement");
CREATE INDEX "IX_TQuoteRequirement_SState" ON ars_platform."TQuoteRequirement" USING btree ("IdeState");
CREATE INDEX "IX_TQuoteRequirement_TQuoteCoverage" ON ars_platform."TQuoteRequirement" USING btree ("IdeQuoteCoverage");
CREATE INDEX "IX_TQuoteRequirement_TQuoteRisk" ON ars_platform."TQuoteRequirement" USING btree ("IdeQuoteRisk");
CREATE INDEX "IX_TQuoteRequirement_TQuoteRiskPlan" ON ars_platform."TQuoteRequirement" USING btree ("IdeQuoteRiskPlan");


-- ars_platform."TQuoteRisk" definition

-- Drop table

-- DROP TABLE ars_platform."TQuoteRisk";

CREATE TABLE ars_platform."TQuoteRisk" (
	"IdeQuoteRisk" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeQuote" uuid NOT NULL,
	"IdeRiskProduct" uuid NOT NULL,
	"NumRisk" int4 NOT NULL,
	"RiskAttributeValue" json NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TQuoteRisk" PRIMARY KEY ("IdeQuoteRisk"),
	CONSTRAINT "UK_TQuoteRisk_01" UNIQUE ("IdeQuote", "IdeRiskProduct", "NumRisk")
);
CREATE INDEX "IX_TQuoteRisk_SRiskProduct" ON ars_platform."TQuoteRisk" USING btree ("IdeRiskProduct");
CREATE INDEX "IX_TQuoteRisk_SState" ON ars_platform."TQuoteRisk" USING btree ("IdeState");
CREATE INDEX "IX_TQuoteRisk_TQuote" ON ars_platform."TQuoteRisk" USING btree ("IdeQuote");


-- ars_platform."TQuoteRiskPlan" definition

-- Drop table

-- DROP TABLE ars_platform."TQuoteRiskPlan";

CREATE TABLE ars_platform."TQuoteRiskPlan" (
	"IdeQuoteRiskPlan" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeQuoteRisk" uuid NOT NULL,
	"IdePlanProductRisk" uuid NOT NULL,
	"IndSelected" bool NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TQuoteRiskPlan" PRIMARY KEY ("IdeQuoteRiskPlan")
);
CREATE INDEX "IX_TQuoteRiskPlan_SPlanProductRisk" ON ars_platform."TQuoteRiskPlan" USING btree ("IdePlanProductRisk");
CREATE INDEX "IX_TQuoteRiskPlan_SState" ON ars_platform."TQuoteRiskPlan" USING btree ("IdeState");
CREATE INDEX "IX_TQuoteRiskPlan_TQuoteRisk" ON ars_platform."TQuoteRiskPlan" USING btree ("IdeQuoteRisk");


-- ars_platform."TReceipt" definition

-- Drop table

-- DROP TABLE ars_platform."TReceipt";

CREATE TABLE ars_platform."TReceipt" (
	"IdeReceipt" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeContractFile" uuid NOT NULL,
	"IdeContractOperation" uuid NOT NULL,
	"IdeContract" uuid NOT NULL,
	"IdeReceiptType" uuid NOT NULL,
	"NumReceipt" varchar NOT NULL,
	"NumExternalReceipt" varchar NULL,
	"TstIssue" timestamp NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NOT NULL,
	"TstBilling" timestamp NULL,
	"TstDueDate" timestamp NULL,
	"NumBilling" varchar NULL,
	"IdeCancellationReason" uuid NULL,
	"TstCancellation" timestamp NULL,
	"DesCancellation" varchar NULL,
	"Fee" numeric NOT NULL,
	"Prime" numeric NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TReceipt" PRIMARY KEY ("IdeReceipt"),
	CONSTRAINT "UK_TReceipt_01" UNIQUE ("IdeContractFile", "IdeContractOperation", "IdeContract", "IdeReceiptType")
);
CREATE INDEX "IX_TReceipt_SReceiptType" ON ars_platform."TReceipt" USING btree ("IdeReceiptType");
CREATE INDEX "IX_TReceipt_SState" ON ars_platform."TReceipt" USING btree ("IdeState");
CREATE INDEX "IX_TReceipt_TContract" ON ars_platform."TReceipt" USING btree ("IdeContract");
CREATE INDEX "IX_TReceipt_TContractFile" ON ars_platform."TReceipt" USING btree ("IdeContractFile");
CREATE INDEX "IX_TReceipt_TContractOperation" ON ars_platform."TReceipt" USING btree ("IdeContractOperation");


-- ars_platform."TReceiptDetail" definition

-- Drop table

-- DROP TABLE ars_platform."TReceiptDetail";

CREATE TABLE ars_platform."TReceiptDetail" (
	"IdeReceiptDetail" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeReceipt" uuid NOT NULL,
	"IdeCoverageMovement" uuid NOT NULL,
	"IdeInsuranceLine" uuid NOT NULL,
	"IdeConcept" uuid NOT NULL,
	"ConceptValue" numeric NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TReceiptDetail" PRIMARY KEY ("IdeReceiptDetail")
);
CREATE INDEX "IX_TReceiptDetail_SConcept" ON ars_platform."TReceiptDetail" USING btree ("IdeConcept");
CREATE INDEX "IX_TReceiptDetail_SInsuranceLine" ON ars_platform."TReceiptDetail" USING btree ("IdeInsuranceLine");
CREATE INDEX "IX_TReceiptDetail_SState" ON ars_platform."TReceiptDetail" USING btree ("IdeState");
CREATE INDEX "IX_TReceiptDetail_TCoverageMovement" ON ars_platform."TReceiptDetail" USING btree ("IdeCoverageMovement");
CREATE INDEX "IX_TReceiptDetail_TReceipt" ON ars_platform."TReceiptDetail" USING btree ("IdeReceipt");


-- ars_platform."TRiskCoverage" definition

-- Drop table

-- DROP TABLE ars_platform."TRiskCoverage";

CREATE TABLE ars_platform."TRiskCoverage" (
	"IdeRiskCoverage" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeFileRisk" uuid NOT NULL,
	"IdeCoveragePlan" uuid NOT NULL,
	"TstInitial" timestamp NOT NULL,
	"TstEnd" timestamp NOT NULL,
	"Amount" numeric NOT NULL,
	"Rate" numeric NOT NULL,
	"Prime" numeric NOT NULL,
	"TstCancellation" timestamp NULL,
	"DesCancellation" varchar NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TRiskCoverage" PRIMARY KEY ("IdeRiskCoverage"),
	CONSTRAINT "UK_TRiskCoverage_01" UNIQUE ("IdeFileRisk", "IdeCoveragePlan", "TstInitial", "TstEnd")
);
CREATE INDEX "IX_TRiskCoverage_SCoveragePlan" ON ars_platform."TRiskCoverage" USING btree ("IdeCoveragePlan");
CREATE INDEX "IX_TRiskCoverage_SState" ON ars_platform."TRiskCoverage" USING btree ("IdeState");
CREATE INDEX "IX_TRiskCoverage_TFileRisk" ON ars_platform."TRiskCoverage" USING btree ("IdeFileRisk");


-- ars_platform."TRol" definition

-- Drop table

-- DROP TABLE ars_platform."TRol";

CREATE TABLE ars_platform."TRol" (
	"IdeRol" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodRol" varchar(30) NOT NULL,
	"DesRol" varchar(250) NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TRol" PRIMARY KEY ("IdeRol"),
	CONSTRAINT "UK_TRol_01" UNIQUE ("CodRol")
);
CREATE INDEX "IX_TRol_SState" ON ars_platform."TRol" USING btree ("IdeState");


-- ars_platform."TUser" definition

-- Drop table

-- DROP TABLE ars_platform."TUser";

CREATE TABLE ars_platform."TUser" (
	"IdeUser" uuid DEFAULT gen_random_uuid() NOT NULL,
	"CodUser" varchar(30) NOT NULL,
	"UserName" varchar(60) NOT NULL,
	"UserData" json NULL,
	"IdeRol" uuid NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TUser" PRIMARY KEY ("IdeUser"),
	CONSTRAINT "UK_TUser_01" UNIQUE ("CodUser")
);
CREATE INDEX "IX_TUser_SState" ON ars_platform."TUser" USING btree ("IdeState");
CREATE INDEX "IX_TUser_TRol" ON ars_platform."TUser" USING btree ("IdeRol");


-- ars_platform."TUserCredential" definition

-- Drop table

-- DROP TABLE ars_platform."TUserCredential";

CREATE TABLE ars_platform."TUserCredential" (
	"IdeUserCredential" uuid DEFAULT gen_random_uuid() NOT NULL,
	"IdeUser" uuid NOT NULL,
	"Credential" varchar(250) NOT NULL,
	"IdeState" uuid NOT NULL,
	"UsrCreation" varchar(60) NOT NULL,
	"TstCreation" timestamp NOT NULL,
	"UsrModification" varchar(60) NOT NULL,
	"TstModification" timestamp NOT NULL,
	CONSTRAINT "PK_TUserCredential" PRIMARY KEY ("IdeUserCredential")
);
CREATE INDEX "IX_TUserCredential_SState" ON ars_platform."TUserCredential" USING btree ("IdeState");
CREATE INDEX "IX_TUserCredential_TUser" ON ars_platform."TUserCredential" USING btree ("IdeUser");


-- ars_platform."SAccessConnection" foreign keys

ALTER TABLE ars_platform."SAccessConnection" ADD CONSTRAINT "FK_SAccessConnection_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SApplication" foreign keys

ALTER TABLE ars_platform."SApplication" ADD CONSTRAINT "FK_SAppRole_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SApplication" ADD CONSTRAINT "FK_SAppRole_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SApplicationRole" foreign keys

ALTER TABLE ars_platform."SApplicationRole" ADD CONSTRAINT "FK_SApplicationRole_SApplication" FOREIGN KEY ("IdeApplication") REFERENCES ars_platform."SApplication"("IdeApplication");
ALTER TABLE ars_platform."SApplicationRole" ADD CONSTRAINT "FK_SApplicationRole_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SApplicationRole" ADD CONSTRAINT "FK_SApplicationRole_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SAttribute" foreign keys

ALTER TABLE ars_platform."SAttribute" ADD CONSTRAINT "FK_SAttribute_SFieldDictionary" FOREIGN KEY ("IdeFieldDictionary") REFERENCES ars_platform."SFieldDictionary"("IdeFieldDictionary");
ALTER TABLE ars_platform."SAttribute" ADD CONSTRAINT "FK_SAttribute_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SAttribute" ADD CONSTRAINT "FK_SAttribute_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SAttributeProperty" foreign keys

ALTER TABLE ars_platform."SAttributeProperty" ADD CONSTRAINT "FK_SAttributeProperty_SAttribute" FOREIGN KEY ("IdeAttribute") REFERENCES ars_platform."SAttribute"("IdeAttribute");
ALTER TABLE ars_platform."SAttributeProperty" ADD CONSTRAINT "FK_SAttributeProperty_SModelAttribute" FOREIGN KEY ("IdeModelAttribute") REFERENCES ars_platform."SModelAttribute"("IdeModelAttribute");
ALTER TABLE ars_platform."SAttributeProperty" ADD CONSTRAINT "FK_SAttributeProperty_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SAttributeProperty" ADD CONSTRAINT "FK_SAttributeProperty_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SBrokerType" foreign keys

ALTER TABLE ars_platform."SBrokerType" ADD CONSTRAINT "FK_SBrokerType_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SBrokerType" ADD CONSTRAINT "FK_SBrokerType_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SBusinessActivity" foreign keys

ALTER TABLE ars_platform."SBusinessActivity" ADD CONSTRAINT "FK_SBusinessActivity_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SBusinessActivity" ADD CONSTRAINT "FK_SBusinessActivity_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SCalculationRule" foreign keys

ALTER TABLE ars_platform."SCalculationRule" ADD CONSTRAINT "FK_SCalculationRule_SConcept" FOREIGN KEY ("IdeConcept") REFERENCES ars_platform."SConcept"("IdeConcept");
ALTER TABLE ars_platform."SCalculationRule" ADD CONSTRAINT "FK_SCalculationRule_SCoveragePlan" FOREIGN KEY ("IdeCoveragePlan") REFERENCES ars_platform."SCoveragePlan"("IdeCoveragePlan");
ALTER TABLE ars_platform."SCalculationRule" ADD CONSTRAINT "FK_SCalculationRule_SEntity" FOREIGN KEY ("CodEntityReference") REFERENCES ars_platform."SEntity"("CodEntity");
ALTER TABLE ars_platform."SCalculationRule" ADD CONSTRAINT "FK_SCalculationRule_SPlanProductRisk" FOREIGN KEY ("IdePlanProductRisk") REFERENCES ars_platform."SPlanProductRisk"("IdePlanProductRisk");
ALTER TABLE ars_platform."SCalculationRule" ADD CONSTRAINT "FK_SCalculationRule_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SCalculationRule" ADD CONSTRAINT "FK_SCalculationRule_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");
ALTER TABLE ars_platform."SCalculationRule" ADD CONSTRAINT "FX_SCalculationRule_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");


-- ars_platform."SChannelType" foreign keys

ALTER TABLE ars_platform."SChannelType" ADD CONSTRAINT "FK_SChannelType_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SChannelType" ADD CONSTRAINT "FK_SChannelType_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SClaimEvent" foreign keys

ALTER TABLE ars_platform."SClaimEvent" ADD CONSTRAINT "FK_SClaimEvent_SClaimType" FOREIGN KEY ("IdeClaimType") REFERENCES ars_platform."SClaimType"("IdeClaimType");
ALTER TABLE ars_platform."SClaimEvent" ADD CONSTRAINT "FK_SClaimEvent_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SClaimEvent" ADD CONSTRAINT "FK_SClaimEvent_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SClaimType" foreign keys

ALTER TABLE ars_platform."SClaimType" ADD CONSTRAINT "FK_SClaimType_SCoverage" FOREIGN KEY ("IdeCoverage") REFERENCES ars_platform."SCoverage"("IdeCoverage");
ALTER TABLE ars_platform."SClaimType" ADD CONSTRAINT "FK_SClaimType_SPlanProduct" FOREIGN KEY ("IdePlanProduct") REFERENCES ars_platform."SPlanProduct"("IdePlanProduct");
ALTER TABLE ars_platform."SClaimType" ADD CONSTRAINT "FK_SClaimType_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SClaimType" ADD CONSTRAINT "FK_SClaimType_SRiskProduct" FOREIGN KEY ("IdeRiskProduct") REFERENCES ars_platform."SRiskProduct"("IdeRiskProduct");
ALTER TABLE ars_platform."SClaimType" ADD CONSTRAINT "FK_SClaimType_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SClaimType" ADD CONSTRAINT "FK_SClaimType_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SCommission" foreign keys

ALTER TABLE ars_platform."SCommission" ADD CONSTRAINT "FK_SCommission_SCommissionTable" FOREIGN KEY ("IdeCommissionTable") REFERENCES ars_platform."SCommissionTable"("IdeCommissionTable");
ALTER TABLE ars_platform."SCommission" ADD CONSTRAINT "FK_SCommission_SProcess" FOREIGN KEY ("IdeProcess") REFERENCES ars_platform."SProcess"("IdeProcess");
ALTER TABLE ars_platform."SCommission" ADD CONSTRAINT "FK_SCommission_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SCommissionProduct" foreign keys

ALTER TABLE ars_platform."SCommissionProduct" ADD CONSTRAINT "FK_SCommissionProduct_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SCommissionProduct" ADD CONSTRAINT "FK_SCommissionProduct_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SCommissionTable" foreign keys

ALTER TABLE ars_platform."SCommissionTable" ADD CONSTRAINT "FK_SCommissionTable_SCommissionTree" FOREIGN KEY ("IdeCommissionTree") REFERENCES ars_platform."SCommissionTree"("IdeCommissionTree");
ALTER TABLE ars_platform."SCommissionTable" ADD CONSTRAINT "FK_SCommissionTable_SCoveragePlan" FOREIGN KEY ("IdeCoveragePlan") REFERENCES ars_platform."SCoveragePlan"("IdeCoveragePlan");
ALTER TABLE ars_platform."SCommissionTable" ADD CONSTRAINT "FK_SCommissionTable_SPlanProductRisk" FOREIGN KEY ("IdePlanProductRisk") REFERENCES ars_platform."SPlanProductRisk"("IdePlanProductRisk");
ALTER TABLE ars_platform."SCommissionTable" ADD CONSTRAINT "FK_SCommissionTable_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SCommissionTable" ADD CONSTRAINT "FK_SCommissionTable_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SCommissionTable" ADD CONSTRAINT "FK_SCommissionTable_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SCommissionTree" foreign keys

ALTER TABLE ars_platform."SCommissionTree" ADD CONSTRAINT "FK_SCommissionTree_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SCommissionTree" ADD CONSTRAINT "FK_SCommissionTree_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SConcept" foreign keys

ALTER TABLE ars_platform."SConcept" ADD CONSTRAINT "FK_SConcept_SConceptType" FOREIGN KEY ("IdeConceptType") REFERENCES ars_platform."SConceptType"("IdeConceptType");
ALTER TABLE ars_platform."SConcept" ADD CONSTRAINT "FK_SConcept_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SConcept" ADD CONSTRAINT "FK_SConcept_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SConceptType" foreign keys

ALTER TABLE ars_platform."SConceptType" ADD CONSTRAINT "FK_SConceptType_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SConceptType" ADD CONSTRAINT "FK_SConceptType_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SConsent" foreign keys

ALTER TABLE ars_platform."SConsent" ADD CONSTRAINT "FK_SConsent_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SConsent" ADD CONSTRAINT "FK_SConsent_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SConsent" ADD CONSTRAINT "FK_SConsent_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SContactClass" foreign keys

ALTER TABLE ars_platform."SContactClass" ADD CONSTRAINT "FK_SContactClass_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SContactClass" ADD CONSTRAINT "FK_SContactClass_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SCountry" foreign keys

ALTER TABLE ars_platform."SCountry" ADD CONSTRAINT "FK_SCountry_SLanguage" FOREIGN KEY ("IdeLanguage") REFERENCES ars_platform."SLanguage"("IdeLanguage");
ALTER TABLE ars_platform."SCountry" ADD CONSTRAINT "FK_SCountry_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SCoverage" foreign keys

ALTER TABLE ars_platform."SCoverage" ADD CONSTRAINT "FK_SCoverage_SInsuranceLine" FOREIGN KEY ("IdeInsuranceLine") REFERENCES ars_platform."SInsuranceLine"("IdeInsuranceLine");
ALTER TABLE ars_platform."SCoverage" ADD CONSTRAINT "FK_SCoverage_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SCoverage" ADD CONSTRAINT "FK_SCoverage_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SCoverageGuarantee" foreign keys

ALTER TABLE ars_platform."SCoverageGuarantee" ADD CONSTRAINT "FK_SCoverageGuarantee_SCoveragePlan" FOREIGN KEY ("IdeCoveragePlan") REFERENCES ars_platform."SCoveragePlan"("IdeCoveragePlan");
ALTER TABLE ars_platform."SCoverageGuarantee" ADD CONSTRAINT "FK_SCoverageGuarantee_SDeductibleType" FOREIGN KEY ("IdeDeductibleType") REFERENCES ars_platform."SDeductibleType"("IdeDeductibleType");
ALTER TABLE ars_platform."SCoverageGuarantee" ADD CONSTRAINT "FK_SCoverageGuarantee_SGuarantee" FOREIGN KEY ("IdeGuarantee") REFERENCES ars_platform."SGuarantee"("IdeGuarantee");
ALTER TABLE ars_platform."SCoverageGuarantee" ADD CONSTRAINT "FK_SCoverageGuarantee_SLimitType" FOREIGN KEY ("IdeLimitType") REFERENCES ars_platform."SLimitType"("IdeLimitType");
ALTER TABLE ars_platform."SCoverageGuarantee" ADD CONSTRAINT "FK_SCoverageGuarantee_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SCoverageGuarantee" ADD CONSTRAINT "FK_SCoverageGuarantee_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SCoveragePlan" foreign keys

ALTER TABLE ars_platform."SCoveragePlan" ADD CONSTRAINT "FK_SCoveragePlan_SCoverage" FOREIGN KEY ("IdeCoverage") REFERENCES ars_platform."SCoverage"("IdeCoverage");
ALTER TABLE ars_platform."SCoveragePlan" ADD CONSTRAINT "FK_SCoveragePlan_SDeductibleType" FOREIGN KEY ("IdeDeductibleType") REFERENCES ars_platform."SDeductibleType"("IdeDeductibleType");
ALTER TABLE ars_platform."SCoveragePlan" ADD CONSTRAINT "FK_SCoveragePlan_SLimitType" FOREIGN KEY ("IdeLimitType") REFERENCES ars_platform."SLimitType"("IdeLimitType");
ALTER TABLE ars_platform."SCoveragePlan" ADD CONSTRAINT "FK_SCoveragePlan_SPlanProductRisk" FOREIGN KEY ("IdePlanProductRisk") REFERENCES ars_platform."SPlanProductRisk"("IdePlanProductRisk");
ALTER TABLE ars_platform."SCoveragePlan" ADD CONSTRAINT "FK_SCoveragePlan_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SCurrency" foreign keys

ALTER TABLE ars_platform."SCurrency" ADD CONSTRAINT "FK_SCurrency_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SCurrency" ADD CONSTRAINT "FK_SCurrency_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SDeductibleType" foreign keys

ALTER TABLE ars_platform."SDeductibleType" ADD CONSTRAINT "FK_SDeductibleType_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SDeductibleType" ADD CONSTRAINT "FK_SDeductibleType_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SDepreciation" foreign keys

ALTER TABLE ars_platform."SDepreciation" ADD CONSTRAINT "FK_SDepreciation_SRiskProduct" FOREIGN KEY ("IdeRiskProduct") REFERENCES ars_platform."SRiskProduct"("IdeRiskProduct");
ALTER TABLE ars_platform."SDepreciation" ADD CONSTRAINT "FK_v_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SDiscount" foreign keys

ALTER TABLE ars_platform."SDiscount" ADD CONSTRAINT "FK_SDiscount_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SDiscount" ADD CONSTRAINT "FK_SDiscount_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SDiscountLevel" foreign keys

ALTER TABLE ars_platform."SDiscountLevel" ADD CONSTRAINT "FK_SDiscountLevel_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SDiscountLevel" ADD CONSTRAINT "FK_SDiscountLevel_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SDistributionChannel" foreign keys

ALTER TABLE ars_platform."SDistributionChannel" ADD CONSTRAINT "FK_SDistributionChannel_SChannelType" FOREIGN KEY ("IdeChannelType") REFERENCES ars_platform."SChannelType"("IdeChannelType");
ALTER TABLE ars_platform."SDistributionChannel" ADD CONSTRAINT "FK_SDistributionChannel_SDistributionChannel" FOREIGN KEY ("IdeDistributionChannelParent") REFERENCES ars_platform."SDistributionChannel"("IdeDistributionChannel");
ALTER TABLE ars_platform."SDistributionChannel" ADD CONSTRAINT "FK_SDistributionChannel_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SDistributionChannel" ADD CONSTRAINT "FK_SDistributionChannel_TBroker" FOREIGN KEY ("IdeBroker") REFERENCES ars_platform."TBroker"("IdeBroker");
ALTER TABLE ars_platform."SDistributionChannel" ADD CONSTRAINT "FK_SDistributionChannel_TPerson" FOREIGN KEY ("IdePerson") REFERENCES ars_platform."TPerson"("IdePerson");


-- ars_platform."SDistributionWay" foreign keys

ALTER TABLE ars_platform."SDistributionWay" ADD CONSTRAINT "FK_SDistributionWay_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SDistributionWay" ADD CONSTRAINT "FK_SDistributionWay_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SEndorsement" foreign keys

ALTER TABLE ars_platform."SEndorsement" ADD CONSTRAINT "FK_SEndorsement_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SEndorsement" ADD CONSTRAINT "FK_SEndorsement_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SEndorsementReason" foreign keys

ALTER TABLE ars_platform."SEndorsementReason" ADD CONSTRAINT "FK_SEndorsementReason_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SEndorsementReason" ADD CONSTRAINT "FK_SEndorsementReason_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SEntity" foreign keys

ALTER TABLE ars_platform."SEntity" ADD CONSTRAINT "FK_SEntity_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SFieldDictionary" foreign keys

ALTER TABLE ars_platform."SFieldDictionary" ADD CONSTRAINT "FK_SFieldDictionary_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SFieldDictionary" ADD CONSTRAINT "FK_SFieldDictionary_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SFieldValue" foreign keys

ALTER TABLE ars_platform."SFieldValue" ADD CONSTRAINT "FK_SFieldValue_SFieldDictionary" FOREIGN KEY ("IdeFieldDictionary") REFERENCES ars_platform."SFieldDictionary"("IdeFieldDictionary");
ALTER TABLE ars_platform."SFieldValue" ADD CONSTRAINT "FK_SFieldValue_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SFieldValue" ADD CONSTRAINT "FK_SFieldValue_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SFlowStep" foreign keys

ALTER TABLE ars_platform."SFlowStep" ADD CONSTRAINT "FK_SFlowStep_SProcessFlow" FOREIGN KEY ("IdeProcessFlow") REFERENCES ars_platform."SProcessFlow"("IdeProcessFlow");
ALTER TABLE ars_platform."SFlowStep" ADD CONSTRAINT "FK_SFlowStep_SScreen" FOREIGN KEY ("IdeScreen") REFERENCES ars_platform."SScreen"("IdeScreen");
ALTER TABLE ars_platform."SFlowStep" ADD CONSTRAINT "FK_SFlowStep_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SFlowStep" ADD CONSTRAINT "FK_SStepCurrent_SStep" FOREIGN KEY ("IdeStepCurrent") REFERENCES ars_platform."SStep"("IdeStep");
ALTER TABLE ars_platform."SFlowStep" ADD CONSTRAINT "FK_SStepForward_SStep" FOREIGN KEY ("IdeStepForward") REFERENCES ars_platform."SStep"("IdeStep");


-- ars_platform."SGender" foreign keys

ALTER TABLE ars_platform."SGender" ADD CONSTRAINT "FK_SGender_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SGender" ADD CONSTRAINT "FK_SGender_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SGuarantee" foreign keys

ALTER TABLE ars_platform."SGuarantee" ADD CONSTRAINT "FK_SGuarantee_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SGuarantee" ADD CONSTRAINT "FK_SGuarantee_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SIdentificationType" foreign keys

ALTER TABLE ars_platform."SIdentificationType" ADD CONSTRAINT "FK_SIdentificationType_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SIdentificationType" ADD CONSTRAINT "FK_SIdentificationType_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SInsuranceArea" foreign keys

ALTER TABLE ars_platform."SInsuranceArea" ADD CONSTRAINT "FK_SInsuranceArea_SInsuranceArea" FOREIGN KEY ("IdeInsuranceAreaParent") REFERENCES ars_platform."SInsuranceArea"("IdeInsuranceArea");
ALTER TABLE ars_platform."SInsuranceArea" ADD CONSTRAINT "FK_SInsuranceArea_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SInsuranceArea" ADD CONSTRAINT "FK_SInsuranceArea_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");
ALTER TABLE ars_platform."SInsuranceArea" ADD CONSTRAINT "FK_SLimitType_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SInsuranceLine" foreign keys

ALTER TABLE ars_platform."SInsuranceLine" ADD CONSTRAINT "FK_SInsuranceLine_SInsuranceArea" FOREIGN KEY ("IdeInsuranceArea") REFERENCES ars_platform."SInsuranceArea"("IdeInsuranceArea");
ALTER TABLE ars_platform."SInsuranceLine" ADD CONSTRAINT "FK_SInsuranceLine_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SInsuranceLine" ADD CONSTRAINT "FK_SInsuranceLine_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SLanguage" foreign keys

ALTER TABLE ars_platform."SLanguage" ADD CONSTRAINT "FK_SLanguage_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SLimitType" foreign keys

ALTER TABLE ars_platform."SLimitType" ADD CONSTRAINT "FK_SLimitType_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SLocation" foreign keys

ALTER TABLE ars_platform."SLocation" ADD CONSTRAINT "FK_SLocation_SCountry" FOREIGN KEY ("IdeCountry") REFERENCES ars_platform."SCountry"("IdeCountry");
ALTER TABLE ars_platform."SLocation" ADD CONSTRAINT "FK_SLocation_SLocation" FOREIGN KEY ("IdeLocationParent") REFERENCES ars_platform."SLocation"("IdeLocation");
ALTER TABLE ars_platform."SLocation" ADD CONSTRAINT "FK_SLocation_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SLocation" ADD CONSTRAINT "FK_SLocation_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SMaritalStatus" foreign keys

ALTER TABLE ars_platform."SMaritalStatus" ADD CONSTRAINT "FK_SMaritalStatus_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SMaritalStatus" ADD CONSTRAINT "FK_SMaritalStatus_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SModelAttribute" foreign keys

ALTER TABLE ars_platform."SModelAttribute" ADD CONSTRAINT "FK_SModelAttribute_SEntityApply" FOREIGN KEY ("IdeEntityApply") REFERENCES ars_platform."SEntity"("IdeEntity");
ALTER TABLE ars_platform."SModelAttribute" ADD CONSTRAINT "FK_SModelAttribute_SEntityReference" FOREIGN KEY ("IdeEntityReference") REFERENCES ars_platform."SEntity"("IdeEntity");
ALTER TABLE ars_platform."SModelAttribute" ADD CONSTRAINT "FK_SModelAttribute_SFlowStep" FOREIGN KEY ("IdeFlowStep") REFERENCES ars_platform."SFlowStep"("IdeFlowStep");
ALTER TABLE ars_platform."SModelAttribute" ADD CONSTRAINT "FK_SModelAttribute_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SModelAttribute" ADD CONSTRAINT "FK_SModelAttribute_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SOperation" foreign keys

ALTER TABLE ars_platform."SOperation" ADD CONSTRAINT "FK_SOperation_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SOperation" ADD CONSTRAINT "FK_SOperation_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SOperationProduct" foreign keys

ALTER TABLE ars_platform."SOperationProduct" ADD CONSTRAINT "FK_SOperationProduct_SOperation" FOREIGN KEY ("IdeOperation") REFERENCES ars_platform."SOperation"("IdeOperation");
ALTER TABLE ars_platform."SOperationProduct" ADD CONSTRAINT "FK_SOperationProduct_SOperationService" FOREIGN KEY ("IdeOperationService") REFERENCES ars_platform."SOperationService"("IdeOperationService");
ALTER TABLE ars_platform."SOperationProduct" ADD CONSTRAINT "FK_SOperationProduct_SProcess" FOREIGN KEY ("IdeProcess") REFERENCES ars_platform."SProcess"("IdeProcess");
ALTER TABLE ars_platform."SOperationProduct" ADD CONSTRAINT "FK_SOperationProduct_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SOperationProduct" ADD CONSTRAINT "FK_SOperationProduct_SProductEndorsement" FOREIGN KEY ("IdeProductEndorsement") REFERENCES ars_platform."SProductEndorsement"("IdeProductEndorsement");
ALTER TABLE ars_platform."SOperationProduct" ADD CONSTRAINT "FK_SOperationProduct_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SOperationProductTemplate" foreign keys

ALTER TABLE ars_platform."SOperationProductTemplate" ADD CONSTRAINT "FK_SOperationProductTemplate_SOperationProduct" FOREIGN KEY ("IdeOperationProduct") REFERENCES ars_platform."SOperationProduct"("IdeOperationProduct");
ALTER TABLE ars_platform."SOperationProductTemplate" ADD CONSTRAINT "FK_SOperationProductTemplate_SPersonRol" FOREIGN KEY ("IdePersonRol") REFERENCES ars_platform."SPersonRol"("IdePersonRol");
ALTER TABLE ars_platform."SOperationProductTemplate" ADD CONSTRAINT "FK_SOperationProductTemplate_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SOperationService" foreign keys

ALTER TABLE ars_platform."SOperationService" ADD CONSTRAINT "FK_SOperationService_SOperation" FOREIGN KEY ("IdeOperation") REFERENCES ars_platform."SOperation"("IdeOperation");
ALTER TABLE ars_platform."SOperationService" ADD CONSTRAINT "FK_SOperationService_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SOperationService" ADD CONSTRAINT "FK_SOperationService_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SPaymentFraction" foreign keys

ALTER TABLE ars_platform."SPaymentFraction" ADD CONSTRAINT "FK_SPaymentFraction_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SPaymentFraction" ADD CONSTRAINT "FK_SPaymentFraction_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SPaymentType" foreign keys

ALTER TABLE ars_platform."SPaymentType" ADD CONSTRAINT "FK_SPaymentType_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SPaymentType" ADD CONSTRAINT "FK_SPaymentType_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SPersonRol" foreign keys

ALTER TABLE ars_platform."SPersonRol" ADD CONSTRAINT "FK_SPersonRol_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SPersonRol" ADD CONSTRAINT "FK_SPersonRol_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SPlanProduct" foreign keys

ALTER TABLE ars_platform."SPlanProduct" ADD CONSTRAINT "FK_SPlanProduct_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SPlanProduct" ADD CONSTRAINT "FK_SPlanProduct_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SPlanProduct" ADD CONSTRAINT "FK_SPlanProduct_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SPlanProductRisk" foreign keys

ALTER TABLE ars_platform."SPlanProductRisk" ADD CONSTRAINT "FK_SPlanProductRisk_SPlanProduct" FOREIGN KEY ("IdePlanProduct") REFERENCES ars_platform."SPlanProduct"("IdePlanProduct");
ALTER TABLE ars_platform."SPlanProductRisk" ADD CONSTRAINT "FK_SPlanProductRisk_SRiskProduct" FOREIGN KEY ("IdeRiskProduct") REFERENCES ars_platform."SRiskProduct"("IdeRiskProduct");
ALTER TABLE ars_platform."SPlanProductRisk" ADD CONSTRAINT "FK_SPlanProductRisk_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SPricingConcept" foreign keys

ALTER TABLE ars_platform."SPricingConcept" ADD CONSTRAINT "FK_SPricingConcept_SConcept" FOREIGN KEY ("IdeConcept") REFERENCES ars_platform."SConcept"("IdeConcept");
ALTER TABLE ars_platform."SPricingConcept" ADD CONSTRAINT "FK_SPricingConcept_SPricingRuleSet" FOREIGN KEY ("IdePricingRuleSet") REFERENCES ars_platform."SPricingRuleSet"("IdePricingRuleSet");
ALTER TABLE ars_platform."SPricingConcept" ADD CONSTRAINT "FK_SPricingConcept_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SPricingRuleSet" foreign keys

ALTER TABLE ars_platform."SPricingRuleSet" ADD CONSTRAINT "FK_SPricingRuleSet_SCoveragePlan" FOREIGN KEY ("IdeCoveragePlan") REFERENCES ars_platform."SCoveragePlan"("IdeCoveragePlan");
ALTER TABLE ars_platform."SPricingRuleSet" ADD CONSTRAINT "FK_SPricingRuleSet_SPlanProductRisk" FOREIGN KEY ("IdePlanProductRisk") REFERENCES ars_platform."SPlanProductRisk"("IdePlanProductRisk");
ALTER TABLE ars_platform."SPricingRuleSet" ADD CONSTRAINT "FK_SPricingRuleSet_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SPricingRuleSet" ADD CONSTRAINT "FX_SPricingRuleSet_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");


-- ars_platform."SProcess" foreign keys

ALTER TABLE ars_platform."SProcess" ADD CONSTRAINT "FK_SProcess_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SProcess" ADD CONSTRAINT "FK_SProcess_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SProcessFlow" foreign keys

ALTER TABLE ars_platform."SProcessFlow" ADD CONSTRAINT "FK_SProcessFlow_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SProcessFlow" ADD CONSTRAINT "FK_SProcessFlow_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SProduct" foreign keys

ALTER TABLE ars_platform."SProduct" ADD CONSTRAINT "FK_SProduct_SCurrency" FOREIGN KEY ("IdeCurrency") REFERENCES ars_platform."SCurrency"("IdeCurrency");
ALTER TABLE ars_platform."SProduct" ADD CONSTRAINT "FK_SProduct_SInsuranceArea" FOREIGN KEY ("IdeInsuranceArea") REFERENCES ars_platform."SInsuranceArea"("IdeInsuranceArea");
ALTER TABLE ars_platform."SProduct" ADD CONSTRAINT "FK_SProduct_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SProduct" ADD CONSTRAINT "FK_SProduct_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SProductDiscount" foreign keys

ALTER TABLE ars_platform."SProductDiscount" ADD CONSTRAINT "FK_SProductDiscount_SDiscount" FOREIGN KEY ("IdeDiscount") REFERENCES ars_platform."SDiscount"("IdeDiscount");
ALTER TABLE ars_platform."SProductDiscount" ADD CONSTRAINT "FK_SProductDiscount_SDiscountLevel" FOREIGN KEY ("IdeDiscountLevel") REFERENCES ars_platform."SDiscountLevel"("IdeDiscountLevel");
ALTER TABLE ars_platform."SProductDiscount" ADD CONSTRAINT "FK_SProductDiscount_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SProductDiscount" ADD CONSTRAINT "FK_SProductDiscount_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SProductDiscount" ADD CONSTRAINT "FK_SProductDiscount_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SProductEndorsement" foreign keys

ALTER TABLE ars_platform."SProductEndorsement" ADD CONSTRAINT "FK_SProductEndorsement_SEndorsement" FOREIGN KEY ("IdeEndorsement") REFERENCES ars_platform."SEndorsement"("IdeEndorsement");
ALTER TABLE ars_platform."SProductEndorsement" ADD CONSTRAINT "FK_SProductEndorsement_SEndorsementReason" FOREIGN KEY ("IdeEndorsementReason") REFERENCES ars_platform."SEndorsementReason"("IdeEndorsementReason");
ALTER TABLE ars_platform."SProductEndorsement" ADD CONSTRAINT "FK_SProductEndorsement_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SProductEndorsement" ADD CONSTRAINT "FK_SProductEndorsement_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SProductEndorsement" ADD CONSTRAINT "FK_SProductEndorsement_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SProductPaymentFraction" foreign keys

ALTER TABLE ars_platform."SProductPaymentFraction" ADD CONSTRAINT "FK_SProductPaymentFraction_SPaymentFraction" FOREIGN KEY ("IdePaymentFraction") REFERENCES ars_platform."SPaymentFraction"("IdePaymentFraction");
ALTER TABLE ars_platform."SProductPaymentFraction" ADD CONSTRAINT "FK_SProductPaymentFraction_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SProductPaymentFraction" ADD CONSTRAINT "FK_SProductPaymentFraction_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SProductProcessFlow" foreign keys

ALTER TABLE ars_platform."SProductProcessFlow" ADD CONSTRAINT "FK_SProductProcessFlow_SDistributionChannel" FOREIGN KEY ("IdeDistributionChannel") REFERENCES ars_platform."SDistributionChannel"("IdeDistributionChannel");
ALTER TABLE ars_platform."SProductProcessFlow" ADD CONSTRAINT "FK_SProductProcessFlow_SDistributionWay" FOREIGN KEY ("IdeDistributionWay") REFERENCES ars_platform."SDistributionWay"("IdeDistributionWay");
ALTER TABLE ars_platform."SProductProcessFlow" ADD CONSTRAINT "FK_SProductProcessFlow_SProcessFlow" FOREIGN KEY ("IdeProcessFlow") REFERENCES ars_platform."SProcessFlow"("IdeProcessFlow");
ALTER TABLE ars_platform."SProductProcessFlow" ADD CONSTRAINT "FK_SProductProcessFlow_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SProductProcessFlow" ADD CONSTRAINT "FK_SProductProcessFlow_SRiskProduct" FOREIGN KEY ("IdeRiskProduct") REFERENCES ars_platform."SRiskProduct"("IdeRiskProduct");
ALTER TABLE ars_platform."SProductProcessFlow" ADD CONSTRAINT "FK_SProductProcessFlow_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SProductProcessFlow" ADD CONSTRAINT "FK_SProductProcessFlow_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SProductRequirement" foreign keys

ALTER TABLE ars_platform."SProductRequirement" ADD CONSTRAINT "FK_SProductRequirement_SClaimEvent" FOREIGN KEY ("IdeClaimEvent") REFERENCES ars_platform."SClaimEvent"("IdeClaimEvent");
ALTER TABLE ars_platform."SProductRequirement" ADD CONSTRAINT "FK_SProductRequirement_SClaimType" FOREIGN KEY ("IdeClaimType") REFERENCES ars_platform."SClaimType"("IdeClaimType");
ALTER TABLE ars_platform."SProductRequirement" ADD CONSTRAINT "FK_SProductRequirement_SCoverageGuarantee" FOREIGN KEY ("IdeCoverageGuarantee") REFERENCES ars_platform."SCoverageGuarantee"("IdeCoverageGuarantee");
ALTER TABLE ars_platform."SProductRequirement" ADD CONSTRAINT "FK_SProductRequirement_SCoveragePlan" FOREIGN KEY ("IdeCoveragePlan") REFERENCES ars_platform."SCoveragePlan"("IdeCoveragePlan");
ALTER TABLE ars_platform."SProductRequirement" ADD CONSTRAINT "FK_SProductRequirement_SOperation" FOREIGN KEY ("IdeOperation") REFERENCES ars_platform."SOperation"("IdeOperation");
ALTER TABLE ars_platform."SProductRequirement" ADD CONSTRAINT "FK_SProductRequirement_SPlanProduct" FOREIGN KEY ("IdePlanProduct") REFERENCES ars_platform."SPlanProduct"("IdePlanProduct");
ALTER TABLE ars_platform."SProductRequirement" ADD CONSTRAINT "FK_SProductRequirement_SProcess" FOREIGN KEY ("IdeProcess") REFERENCES ars_platform."SProcess"("IdeProcess");
ALTER TABLE ars_platform."SProductRequirement" ADD CONSTRAINT "FK_SProductRequirement_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SProductRequirement" ADD CONSTRAINT "FK_SProductRequirement_SRequirement" FOREIGN KEY ("IdeRequirement") REFERENCES ars_platform."SRequirement"("IdeRequirement");
ALTER TABLE ars_platform."SProductRequirement" ADD CONSTRAINT "FK_SProductRequirement_SRiskProduct" FOREIGN KEY ("IdeRiskProduct") REFERENCES ars_platform."SRiskProduct"("IdeRiskProduct");
ALTER TABLE ars_platform."SProductRequirement" ADD CONSTRAINT "FK_SProductRequirement_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SProductRequirement" ADD CONSTRAINT "FK_SProductRequirement_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SProductValidityType" foreign keys

ALTER TABLE ars_platform."SProductValidityType" ADD CONSTRAINT "FK_SProductValidityType_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SProductValidityType" ADD CONSTRAINT "FK_SProductValidityType_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SProductValidityType" ADD CONSTRAINT "FK_SProductValidityType_SValidityType" FOREIGN KEY ("IdeValidityType") REFERENCES ars_platform."SValidityType"("IdeValidityType");


-- ars_platform."SProfession" foreign keys

ALTER TABLE ars_platform."SProfession" ADD CONSTRAINT "FK_SCountry_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");
ALTER TABLE ars_platform."SProfession" ADD CONSTRAINT "FK_SProfession_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SProfession" ADD CONSTRAINT "FK_SProfession_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SRateFactor" foreign keys

ALTER TABLE ars_platform."SRateFactor" ADD CONSTRAINT "FK_SRateFactor_SFieldDictionary" FOREIGN KEY ("IdeFieldDictionary") REFERENCES ars_platform."SFieldDictionary"("IdeFieldDictionary");
ALTER TABLE ars_platform."SRateFactor" ADD CONSTRAINT "FK_SRateFactor_SRateTable" FOREIGN KEY ("IdeRateTable") REFERENCES ars_platform."SRateTable"("IdeRateTable");
ALTER TABLE ars_platform."SRateFactor" ADD CONSTRAINT "FK_SRateFactor_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SRateTable" foreign keys

ALTER TABLE ars_platform."SRateTable" ADD CONSTRAINT "FK_SRateTable_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SRateTable" ADD CONSTRAINT "FK_SRateTable_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SRateValue" foreign keys

ALTER TABLE ars_platform."SRateValue" ADD CONSTRAINT "FK_SRateValue_SRateTable" FOREIGN KEY ("IdeRateTable") REFERENCES ars_platform."SRateTable"("IdeRateTable");
ALTER TABLE ars_platform."SRateValue" ADD CONSTRAINT "FK_SRateValue_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SReceiptType" foreign keys

ALTER TABLE ars_platform."SReceiptType" ADD CONSTRAINT "FK_SReceiptType_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SReceiptType" ADD CONSTRAINT "FK_SReceiptType_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SRelationship" foreign keys

ALTER TABLE ars_platform."SRelationship" ADD CONSTRAINT "FK_SRelationship_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SRelationship" ADD CONSTRAINT "FK_SRelationship_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SRequirement" foreign keys

ALTER TABLE ars_platform."SRequirement" ADD CONSTRAINT "FK_SRequirement_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SRequirement" ADD CONSTRAINT "FK_SRequirement_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SRisk" foreign keys

ALTER TABLE ars_platform."SRisk" ADD CONSTRAINT "FK_SRisk_SRiskLevel" FOREIGN KEY ("IdeRiskLevel") REFERENCES ars_platform."SRiskLevel"("IdeRiskLevel");
ALTER TABLE ars_platform."SRisk" ADD CONSTRAINT "FK_SRisk_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SRisk" ADD CONSTRAINT "FK_SRisk_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SRiskLevel" foreign keys

ALTER TABLE ars_platform."SRiskLevel" ADD CONSTRAINT "FK_SRiskLevel_SRiskLevel" FOREIGN KEY ("IdeRiskLevelParent") REFERENCES ars_platform."SRiskLevel"("IdeRiskLevel");
ALTER TABLE ars_platform."SRiskLevel" ADD CONSTRAINT "FK_SRiskLevel_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SRiskLevel" ADD CONSTRAINT "FK_SRiskLevel_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SRiskProduct" foreign keys

ALTER TABLE ars_platform."SRiskProduct" ADD CONSTRAINT "FK_SRiskProduct_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."SRiskProduct" ADD CONSTRAINT "FK_SRiskProduct_SRisk" FOREIGN KEY ("IdeRisk") REFERENCES ars_platform."SRisk"("IdeRisk");
ALTER TABLE ars_platform."SRiskProduct" ADD CONSTRAINT "FK_SRiskProduct_SRiskType" FOREIGN KEY ("IdeRiskType") REFERENCES ars_platform."SRiskType"("IdeRiskType");
ALTER TABLE ars_platform."SRiskProduct" ADD CONSTRAINT "FK_SRiskProduct_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SRiskProduct" ADD CONSTRAINT "FK_SRiskProduct_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SRiskProductMapping" foreign keys

ALTER TABLE ars_platform."SRiskProductMapping" ADD CONSTRAINT "FK_SOperationProductTemplate_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SRiskProductMapping" ADD CONSTRAINT "FK_SRiskProductMapping_SRiskProduct" FOREIGN KEY ("CodRiskProduct") REFERENCES ars_platform."SRiskProduct"("CodRiskProduct");


-- ars_platform."SRiskType" foreign keys

ALTER TABLE ars_platform."SRiskType" ADD CONSTRAINT "FK_SRiskType_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SRiskType" ADD CONSTRAINT "FK_SRiskType_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SScreen" foreign keys

ALTER TABLE ars_platform."SScreen" ADD CONSTRAINT "FK_SScreen_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SSiteMap" foreign keys

ALTER TABLE ars_platform."SSiteMap" ADD CONSTRAINT "FK_SSiteMap_SSiteMap" FOREIGN KEY ("IdeSiteMapParent") REFERENCES ars_platform."SSiteMap"("IdeSiteMap");
ALTER TABLE ars_platform."SSiteMap" ADD CONSTRAINT "FK_SSiteMap_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SSiteMap" ADD CONSTRAINT "FK_SSiteMap_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SSiteMapRole" foreign keys

ALTER TABLE ars_platform."SSiteMapRole" ADD CONSTRAINT "FK_SSiteMapRole_SApplicationRole" FOREIGN KEY ("IdeApplicationRole") REFERENCES ars_platform."SApplicationRole"("IdeApplicationRole");
ALTER TABLE ars_platform."SSiteMapRole" ADD CONSTRAINT "FK_SSiteMapRole_SSiteMap" FOREIGN KEY ("IdeSiteMap") REFERENCES ars_platform."SSiteMap"("IdeSiteMap");
ALTER TABLE ars_platform."SSiteMapRole" ADD CONSTRAINT "FK_SSiteMapRole_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SState" foreign keys

ALTER TABLE ars_platform."SState" ADD CONSTRAINT "FK_SState_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SStateRule" foreign keys

ALTER TABLE ars_platform."SStateRule" ADD CONSTRAINT "FK_SStateRuleFrom_SState" FOREIGN KEY ("IdeStateFrom") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SStateRule" ADD CONSTRAINT "FK_SStateRuleTo_SState" FOREIGN KEY ("IdeStateTo") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SStateRule" ADD CONSTRAINT "FK_SStateRule_SEntity" FOREIGN KEY ("IdeEntity") REFERENCES ars_platform."SEntity"("IdeEntity");
ALTER TABLE ars_platform."SStateRule" ADD CONSTRAINT "FK_SStateRule_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."SStep" foreign keys

ALTER TABLE ars_platform."SStep" ADD CONSTRAINT "FK_SStep_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."STextContent" foreign keys

ALTER TABLE ars_platform."STextContent" ADD CONSTRAINT "FK_STextContent_SLanguage" FOREIGN KEY ("IdeLanguage") REFERENCES ars_platform."SLanguage"("IdeLanguage");
ALTER TABLE ars_platform."STextContent" ADD CONSTRAINT "FK_STextContent_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."STranslator" foreign keys

ALTER TABLE ars_platform."STranslator" ADD CONSTRAINT "FK_STranslator_SLanguage" FOREIGN KEY ("IdeLanguage") REFERENCES ars_platform."SLanguage"("IdeLanguage");
ALTER TABLE ars_platform."STranslator" ADD CONSTRAINT "FK_STranslator_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."STranslator" ADD CONSTRAINT "FK_STranslator_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."SValidityType" foreign keys

ALTER TABLE ars_platform."SValidityType" ADD CONSTRAINT "FK_SValidityType_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."SValidityType" ADD CONSTRAINT "FK_SValidityType_STextContent" FOREIGN KEY ("IdeTextContent") REFERENCES ars_platform."STextContent"("IdeTextContent");


-- ars_platform."TAddress" foreign keys

ALTER TABLE ars_platform."TAddress" ADD CONSTRAINT "FK_TAddress_SCountry" FOREIGN KEY ("IdeCountry") REFERENCES ars_platform."SCountry"("IdeCountry");
ALTER TABLE ars_platform."TAddress" ADD CONSTRAINT "FK_TAddress_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TAddress" ADD CONSTRAINT "FK_TAddress_TPerson" FOREIGN KEY ("IdePerson") REFERENCES ars_platform."TPerson"("IdePerson");


-- ars_platform."TApproval" foreign keys

ALTER TABLE ars_platform."TApproval" ADD CONSTRAINT "FK_TApproval_SPaymentType" FOREIGN KEY ("IdePaymentType") REFERENCES ars_platform."SPaymentType"("IdePaymentType");
ALTER TABLE ars_platform."TApproval" ADD CONSTRAINT "FK_TApproval_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TApproval" ADD CONSTRAINT "FK_TApproval_TClaimFile" FOREIGN KEY ("IdeClaimFile") REFERENCES ars_platform."TClaimFile"("IdeClaimFile");
ALTER TABLE ars_platform."TApproval" ADD CONSTRAINT "FK_TApproval_TPerson" FOREIGN KEY ("IdePersonPayment") REFERENCES ars_platform."TPerson"("IdePerson");


-- ars_platform."TApprovalDetail" foreign keys

ALTER TABLE ars_platform."TApprovalDetail" ADD CONSTRAINT "FK_TApprovalDetail_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TApprovalDetail" ADD CONSTRAINT "FK_TApprovalDetail_TApproval" FOREIGN KEY ("IdeApproval") REFERENCES ars_platform."TApproval"("IdeApproval");
ALTER TABLE ars_platform."TApprovalDetail" ADD CONSTRAINT "FK_TApprovalDetail_TCoverageProvision" FOREIGN KEY ("IdeCoverageProvision") REFERENCES ars_platform."TCoverageProvision"("IdeCoverageProvision");


-- ars_platform."TBroker" foreign keys

ALTER TABLE ars_platform."TBroker" ADD CONSTRAINT "FK_TBroker_SBrokerType" FOREIGN KEY ("IdeBrokerType") REFERENCES ars_platform."SBrokerType"("IdeBrokerType");
ALTER TABLE ars_platform."TBroker" ADD CONSTRAINT "FK_TBroker_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TBroker" ADD CONSTRAINT "FK_TBroker_TPerson" FOREIGN KEY ("IdePerson") REFERENCES ars_platform."TPerson"("IdePerson");


-- ars_platform."TClaim" foreign keys

ALTER TABLE ars_platform."TClaim" ADD CONSTRAINT "FK_TClaim_SClaimType" FOREIGN KEY ("IdeClaimType") REFERENCES ars_platform."SClaimType"("IdeClaimType");
ALTER TABLE ars_platform."TClaim" ADD CONSTRAINT "FK_TClaim_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TClaim" ADD CONSTRAINT "FK_TClaim_TContractFile" FOREIGN KEY ("IdeContractFile") REFERENCES ars_platform."TContractFile"("IdeContractFile");


-- ars_platform."TClaimFile" foreign keys

ALTER TABLE ars_platform."TClaimFile" ADD CONSTRAINT "FK_TClaimFile_SClaimEvent" FOREIGN KEY ("IdeClaimEvent") REFERENCES ars_platform."SClaimEvent"("IdeClaimEvent");
ALTER TABLE ars_platform."TClaimFile" ADD CONSTRAINT "FK_TClaimFile_SCurrency" FOREIGN KEY ("IdeCurrency") REFERENCES ars_platform."SCurrency"("IdeCurrency");
ALTER TABLE ars_platform."TClaimFile" ADD CONSTRAINT "FK_TClaimFile_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TClaimFile" ADD CONSTRAINT "FK_TClaimFile_TClaim" FOREIGN KEY ("IdeClaim") REFERENCES ars_platform."TClaim"("IdeClaim");


-- ars_platform."TClaimOperation" foreign keys

ALTER TABLE ars_platform."TClaimOperation" ADD CONSTRAINT "FK_TClaimOperation_SOperationProduct" FOREIGN KEY ("IdeOperationProduct") REFERENCES ars_platform."SOperationProduct"("IdeOperationProduct");
ALTER TABLE ars_platform."TClaimOperation" ADD CONSTRAINT "FK_TClaimOperation_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TClaimOperation" ADD CONSTRAINT "FK_TClaimOperation_TClaim" FOREIGN KEY ("IdeClaim") REFERENCES ars_platform."TClaim"("IdeClaim");


-- ars_platform."TClaimRequirement" foreign keys

ALTER TABLE ars_platform."TClaimRequirement" ADD CONSTRAINT "FK_TClaimRequirement_SProductRequirement" FOREIGN KEY ("IdeProductRequirement") REFERENCES ars_platform."SProductRequirement"("IdeProductRequirement");
ALTER TABLE ars_platform."TClaimRequirement" ADD CONSTRAINT "FK_TClaimRequirement_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TClaimRequirement" ADD CONSTRAINT "FK_TClaimRequirement_TClaimFile" FOREIGN KEY ("IdeClaimFile") REFERENCES ars_platform."TClaimFile"("IdeClaimFile");
ALTER TABLE ars_platform."TClaimRequirement" ADD CONSTRAINT "FK_TClaimRequirement_TClaimRisk" FOREIGN KEY ("IdeClaimRisk") REFERENCES ars_platform."TClaimRisk"("IdeClaimRisk");


-- ars_platform."TClaimRisk" foreign keys

ALTER TABLE ars_platform."TClaimRisk" ADD CONSTRAINT "FK_TClaimRisk_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TClaimRisk" ADD CONSTRAINT "FK_TClaimRisk_TClaimFile" FOREIGN KEY ("IdeClaimFile") REFERENCES ars_platform."TClaimFile"("IdeClaimFile");
ALTER TABLE ars_platform."TClaimRisk" ADD CONSTRAINT "FK_TClaimRisk_TFileRisk" FOREIGN KEY ("IdeFileRisk") REFERENCES ars_platform."TFileRisk"("IdeFileRisk");


-- ars_platform."TContactData" foreign keys

ALTER TABLE ars_platform."TContactData" ADD CONSTRAINT "FK_TContactData_SContactClass" FOREIGN KEY ("IdeContactClass") REFERENCES ars_platform."SContactClass"("IdeContactClass");
ALTER TABLE ars_platform."TContactData" ADD CONSTRAINT "FK_TContactData_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TContactData" ADD CONSTRAINT "FK_TContactData_TPerson" FOREIGN KEY ("IdePerson") REFERENCES ars_platform."TPerson"("IdePerson");


-- ars_platform."TContract" foreign keys

ALTER TABLE ars_platform."TContract" ADD CONSTRAINT "FK_TContract_SPaymentFraction" FOREIGN KEY ("IdePaymentFraction") REFERENCES ars_platform."SPaymentFraction"("IdePaymentFraction");
ALTER TABLE ars_platform."TContract" ADD CONSTRAINT "FK_TContract_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."TContract" ADD CONSTRAINT "FK_TContract_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TContract" ADD CONSTRAINT "FK_TContract_SValidityType" FOREIGN KEY ("IdeValidityType") REFERENCES ars_platform."SValidityType"("IdeValidityType");
ALTER TABLE ars_platform."TContract" ADD CONSTRAINT "FK_TContract_TQuote" FOREIGN KEY ("IdeQuote") REFERENCES ars_platform."TQuote"("IdeQuote");


-- ars_platform."TContractBilling" foreign keys

ALTER TABLE ars_platform."TContractBilling" ADD CONSTRAINT "FK_TContractBilling_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TContractBilling" ADD CONSTRAINT "FK_TContractBilling_TContract" FOREIGN KEY ("IdeContract") REFERENCES ars_platform."TContract"("IdeContract");


-- ars_platform."TContractDistributionChannel" foreign keys

ALTER TABLE ars_platform."TContractDistributionChannel" ADD CONSTRAINT "FK_TContractDistributionChannel_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TContractDistributionChannel" ADD CONSTRAINT "FK_TContractDistributionChannel_TContract" FOREIGN KEY ("IdeContract") REFERENCES ars_platform."TContract"("IdeContract");


-- ars_platform."TContractFile" foreign keys

ALTER TABLE ars_platform."TContractFile" ADD CONSTRAINT "FK_SCancellationReasonEntity_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TContractFile" ADD CONSTRAINT "FK_TContractFile_TContract" FOREIGN KEY ("IdeContract") REFERENCES ars_platform."TContract"("IdeContract");


-- ars_platform."TContractFilePerson" foreign keys

ALTER TABLE ars_platform."TContractFilePerson" ADD CONSTRAINT "FK_TContractFilePerson_SPersonRol" FOREIGN KEY ("IdePersonRol") REFERENCES ars_platform."SPersonRol"("IdePersonRol");
ALTER TABLE ars_platform."TContractFilePerson" ADD CONSTRAINT "FK_TContractFilePerson_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TContractFilePerson" ADD CONSTRAINT "FK_TContractFilePerson_TContractFile" FOREIGN KEY ("IdeContractFile") REFERENCES ars_platform."TContractFile"("IdeContractFile");
ALTER TABLE ars_platform."TContractFilePerson" ADD CONSTRAINT "FK_TContractFilePerson_TPerson" FOREIGN KEY ("IdePerson") REFERENCES ars_platform."TPerson"("IdePerson");


-- ars_platform."TContractOperation" foreign keys

ALTER TABLE ars_platform."TContractOperation" ADD CONSTRAINT "FK_TContractOperation_SOperationProduct" FOREIGN KEY ("IdeOperationProduct") REFERENCES ars_platform."SOperationProduct"("IdeOperationProduct");
ALTER TABLE ars_platform."TContractOperation" ADD CONSTRAINT "FK_TContractOperation_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TContractOperation" ADD CONSTRAINT "FK_TContractOperation_TContract" FOREIGN KEY ("IdeContract") REFERENCES ars_platform."TContract"("IdeContract");


-- ars_platform."TContractOperationDocument" foreign keys

ALTER TABLE ars_platform."TContractOperationDocument" ADD CONSTRAINT "FK_TContractOperationDocument_TContractOperation" FOREIGN KEY ("IdeContractOperation") REFERENCES ars_platform."TContractOperation"("IdeContractOperation");
ALTER TABLE ars_platform."TContractOperationDocument" ADD CONSTRAINT "FK_TContractRequirement_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."TContractPerson" foreign keys

ALTER TABLE ars_platform."TContractPerson" ADD CONSTRAINT "FK_TContractPerson_SPersonRol" FOREIGN KEY ("IdePersonRol") REFERENCES ars_platform."SPersonRol"("IdePersonRol");
ALTER TABLE ars_platform."TContractPerson" ADD CONSTRAINT "FK_TContractPerson_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TContractPerson" ADD CONSTRAINT "FK_TContractPerson_TContract" FOREIGN KEY ("IdeContract") REFERENCES ars_platform."TContract"("IdeContract");
ALTER TABLE ars_platform."TContractPerson" ADD CONSTRAINT "FK_TContractPerson_TPerson" FOREIGN KEY ("IdePerson") REFERENCES ars_platform."TPerson"("IdePerson");


-- ars_platform."TContractRequirement" foreign keys

ALTER TABLE ars_platform."TContractRequirement" ADD CONSTRAINT "FK_TContractRequirement_SProductRequirement" FOREIGN KEY ("IdeProductRequirement") REFERENCES ars_platform."SProductRequirement"("IdeProductRequirement");
ALTER TABLE ars_platform."TContractRequirement" ADD CONSTRAINT "FK_TContractRequirement_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TContractRequirement" ADD CONSTRAINT "FK_TContractRequirement_TFileRisk" FOREIGN KEY ("IdeFileRisk") REFERENCES ars_platform."TFileRisk"("IdeFileRisk");
ALTER TABLE ars_platform."TContractRequirement" ADD CONSTRAINT "FK_TContractRequirement_TRiskCoverage" FOREIGN KEY ("IdeRiskCoverage") REFERENCES ars_platform."TRiskCoverage"("IdeRiskCoverage");


-- ars_platform."TCoverageMovement" foreign keys

ALTER TABLE ars_platform."TCoverageMovement" ADD CONSTRAINT "FK_TCoverageMovement_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TCoverageMovement" ADD CONSTRAINT "FK_TCoverageMovement_TContractOperation" FOREIGN KEY ("IdeContractOperation") REFERENCES ars_platform."TContractOperation"("IdeContractOperation");
ALTER TABLE ars_platform."TCoverageMovement" ADD CONSTRAINT "FK_TCoverageMovement_TRiskCoverage" FOREIGN KEY ("IdeRiskCoverage") REFERENCES ars_platform."TRiskCoverage"("IdeRiskCoverage");


-- ars_platform."TCoverageProvision" foreign keys

ALTER TABLE ars_platform."TCoverageProvision" ADD CONSTRAINT "FK_TCoverageProvision_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TCoverageProvision" ADD CONSTRAINT "FK_TCoverageProvision_TClaimRisk" FOREIGN KEY ("IdeClaimRisk") REFERENCES ars_platform."TClaimRisk"("IdeClaimRisk");
ALTER TABLE ars_platform."TCoverageProvision" ADD CONSTRAINT "FK_TCoverageProvision_TRiskCoverage" FOREIGN KEY ("IdeRiskCoverage") REFERENCES ars_platform."TRiskCoverage"("IdeRiskCoverage");


-- ars_platform."TFileRisk" foreign keys

ALTER TABLE ars_platform."TFileRisk" ADD CONSTRAINT "FK_TFileRisk_SPlanProductRisk" FOREIGN KEY ("IdePlanProductRisk") REFERENCES ars_platform."SPlanProductRisk"("IdePlanProductRisk");
ALTER TABLE ars_platform."TFileRisk" ADD CONSTRAINT "FK_TFileRisk_SRiskProduct" FOREIGN KEY ("IdeRiskProduct") REFERENCES ars_platform."SRiskProduct"("IdeRiskProduct");
ALTER TABLE ars_platform."TFileRisk" ADD CONSTRAINT "FK_TFileRisk_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TFileRisk" ADD CONSTRAINT "FK_TFileRisk_TContractFile" FOREIGN KEY ("IdeContractFile") REFERENCES ars_platform."TContractFile"("IdeContractFile");


-- ars_platform."TFileRiskPerson" foreign keys

ALTER TABLE ars_platform."TFileRiskPerson" ADD CONSTRAINT "FK_TFileRiskPerson_SPersonRol" FOREIGN KEY ("IdePersonRol") REFERENCES ars_platform."SPersonRol"("IdePersonRol");
ALTER TABLE ars_platform."TFileRiskPerson" ADD CONSTRAINT "FK_TFileRiskPerson_SRelationship" FOREIGN KEY ("IdeRelationship") REFERENCES ars_platform."SRelationship"("IdeRelationship");
ALTER TABLE ars_platform."TFileRiskPerson" ADD CONSTRAINT "FK_TFileRiskPerson_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TFileRiskPerson" ADD CONSTRAINT "FK_TFileRiskPerson_TFileRisk" FOREIGN KEY ("IdeFileRisk") REFERENCES ars_platform."TFileRisk"("IdeFileRisk");
ALTER TABLE ars_platform."TFileRiskPerson" ADD CONSTRAINT "FK_TFileRiskPerson_TPerson" FOREIGN KEY ("IdePerson") REFERENCES ars_platform."TPerson"("IdePerson");


-- ars_platform."TFlowStepInstance" foreign keys

ALTER TABLE ars_platform."TFlowStepInstance" ADD CONSTRAINT "FK_TFlowStepInstance_SFlowStep" FOREIGN KEY ("IdeFlowStep") REFERENCES ars_platform."SFlowStep"("IdeFlowStep");


-- ars_platform."TGuaranteeProvision" foreign keys

ALTER TABLE ars_platform."TGuaranteeProvision" ADD CONSTRAINT "FK_TGuaranteeProvision_SCoverageGuarantee" FOREIGN KEY ("IdeCoverageGuarantee") REFERENCES ars_platform."SCoverageGuarantee"("IdeCoverageGuarantee");
ALTER TABLE ars_platform."TGuaranteeProvision" ADD CONSTRAINT "FK_TGuaranteeProvision_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TGuaranteeProvision" ADD CONSTRAINT "FK_TGuaranteeProvision_TCoverageProvision" FOREIGN KEY ("IdeCoverageProvision") REFERENCES ars_platform."TCoverageProvision"("IdeCoverageProvision");


-- ars_platform."TMovementConcept" foreign keys

ALTER TABLE ars_platform."TMovementConcept" ADD CONSTRAINT "FK_TMovementConcept_SConcept" FOREIGN KEY ("IdeConcept") REFERENCES ars_platform."SConcept"("IdeConcept");
ALTER TABLE ars_platform."TMovementConcept" ADD CONSTRAINT "FK_TMovementConcept_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TMovementConcept" ADD CONSTRAINT "FK_TMovementConcept_TCoverageMovement" FOREIGN KEY ("IdeCoverageMovement") REFERENCES ars_platform."TCoverageMovement"("IdeCoverageMovement");


-- ars_platform."TPerson" foreign keys

ALTER TABLE ars_platform."TPerson" ADD CONSTRAINT "FK_TPerson_SBusinessActivity" FOREIGN KEY ("IdeBusinessActivity") REFERENCES ars_platform."SBusinessActivity"("IdeBusinessActivity");
ALTER TABLE ars_platform."TPerson" ADD CONSTRAINT "FK_TPerson_SCountry" FOREIGN KEY ("IdeCountryBirth") REFERENCES ars_platform."SCountry"("IdeCountry");
ALTER TABLE ars_platform."TPerson" ADD CONSTRAINT "FK_TPerson_SGender" FOREIGN KEY ("IdeGender") REFERENCES ars_platform."SGender"("IdeGender");
ALTER TABLE ars_platform."TPerson" ADD CONSTRAINT "FK_TPerson_SIdentificationType" FOREIGN KEY ("IdeIdentificationType") REFERENCES ars_platform."SIdentificationType"("IdeIdentificationType");
ALTER TABLE ars_platform."TPerson" ADD CONSTRAINT "FK_TPerson_SLocation" FOREIGN KEY ("IdeLocationBirth") REFERENCES ars_platform."SLocation"("IdeLocation");
ALTER TABLE ars_platform."TPerson" ADD CONSTRAINT "FK_TPerson_SMaritalStatus" FOREIGN KEY ("IdeMaritalStatus") REFERENCES ars_platform."SMaritalStatus"("IdeMaritalStatus");
ALTER TABLE ars_platform."TPerson" ADD CONSTRAINT "FK_TPerson_SProfession" FOREIGN KEY ("IdeProfession") REFERENCES ars_platform."SProfession"("IdeProfession");
ALTER TABLE ars_platform."TPerson" ADD CONSTRAINT "FK_TPerson_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."TPersonConsent" foreign keys

ALTER TABLE ars_platform."TPersonConsent" ADD CONSTRAINT "FK_TPersonConsent_SConsent" FOREIGN KEY ("IdeConsent") REFERENCES ars_platform."SConsent"("IdeConsent");
ALTER TABLE ars_platform."TPersonConsent" ADD CONSTRAINT "FK_TPersonConsent_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TPersonConsent" ADD CONSTRAINT "FK_TPersonConsent_TContractOperation" FOREIGN KEY ("IdeContractOperation") REFERENCES ars_platform."TContractOperation"("IdeContractOperation");
ALTER TABLE ars_platform."TPersonConsent" ADD CONSTRAINT "FK_TPersonConsent_TPerson" FOREIGN KEY ("IdePerson") REFERENCES ars_platform."TPerson"("IdePerson");
ALTER TABLE ars_platform."TPersonConsent" ADD CONSTRAINT "FK_TPersonConsent_TQuote" FOREIGN KEY ("IdeQuote") REFERENCES ars_platform."TQuote"("IdeQuote");


-- ars_platform."TQuote" foreign keys

ALTER TABLE ars_platform."TQuote" ADD CONSTRAINT "FK_TQuote_SDistributionWay" FOREIGN KEY ("IdeDistributionWay") REFERENCES ars_platform."SDistributionWay"("IdeDistributionWay");
ALTER TABLE ars_platform."TQuote" ADD CONSTRAINT "FK_TQuote_SProduct" FOREIGN KEY ("IdeProduct") REFERENCES ars_platform."SProduct"("IdeProduct");
ALTER TABLE ars_platform."TQuote" ADD CONSTRAINT "FK_TQuote_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TQuote" ADD CONSTRAINT "FK_TQuote_TPerson" FOREIGN KEY ("IdePerson") REFERENCES ars_platform."TPerson"("IdePerson");


-- ars_platform."TQuoteCoverage" foreign keys

ALTER TABLE ars_platform."TQuoteCoverage" ADD CONSTRAINT "FK_TQuoteCoverage_SCoveragePlan" FOREIGN KEY ("IdeCoveragePlan") REFERENCES ars_platform."SCoveragePlan"("IdeCoveragePlan");
ALTER TABLE ars_platform."TQuoteCoverage" ADD CONSTRAINT "FK_TQuoteCoverage_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TQuoteCoverage" ADD CONSTRAINT "FK_TQuoteCoverage_TQuoteRiskPlan" FOREIGN KEY ("IdeQuoteRiskPlan") REFERENCES ars_platform."TQuoteRiskPlan"("IdeQuoteRiskPlan");


-- ars_platform."TQuoteCoverageConcept" foreign keys

ALTER TABLE ars_platform."TQuoteCoverageConcept" ADD CONSTRAINT "FK_TQuoteCoverageConcept_SConcept" FOREIGN KEY ("IdeConcept") REFERENCES ars_platform."SConcept"("IdeConcept");
ALTER TABLE ars_platform."TQuoteCoverageConcept" ADD CONSTRAINT "FK_TQuoteCoverageConcept_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TQuoteCoverageConcept" ADD CONSTRAINT "FK_TQuoteCoverageConcept_TQuoteCoverage" FOREIGN KEY ("IdeQuoteCoverage") REFERENCES ars_platform."TQuoteCoverage"("IdeQuoteCoverage");


-- ars_platform."TQuoteOperation" foreign keys

ALTER TABLE ars_platform."TQuoteOperation" ADD CONSTRAINT "FK_TQuoteOperation_SOperationProduct" FOREIGN KEY ("IdeOperationProduct") REFERENCES ars_platform."SOperationProduct"("IdeOperationProduct");
ALTER TABLE ars_platform."TQuoteOperation" ADD CONSTRAINT "FK_TQuoteOperation_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TQuoteOperation" ADD CONSTRAINT "FK_TQuoteOperation_TQuote" FOREIGN KEY ("IdeQuote") REFERENCES ars_platform."TQuote"("IdeQuote");


-- ars_platform."TQuotePerson" foreign keys

ALTER TABLE ars_platform."TQuotePerson" ADD CONSTRAINT "FK_TQuotePerson_SPersonRol" FOREIGN KEY ("IdePersonRol") REFERENCES ars_platform."SPersonRol"("IdePersonRol");
ALTER TABLE ars_platform."TQuotePerson" ADD CONSTRAINT "FK_TQuotePerson_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TQuotePerson" ADD CONSTRAINT "FK_TQuotePerson_TPerson" FOREIGN KEY ("IdePerson") REFERENCES ars_platform."TPerson"("IdePerson");
ALTER TABLE ars_platform."TQuotePerson" ADD CONSTRAINT "FK_TQuotePerson_TQuote" FOREIGN KEY ("IdeQuote") REFERENCES ars_platform."TQuote"("IdeQuote");


-- ars_platform."TQuoteRequirement" foreign keys

ALTER TABLE ars_platform."TQuoteRequirement" ADD CONSTRAINT "FK_TQuoteRequirement_SProductRequirement" FOREIGN KEY ("IdeProductRequirement") REFERENCES ars_platform."SProductRequirement"("IdeProductRequirement");
ALTER TABLE ars_platform."TQuoteRequirement" ADD CONSTRAINT "FK_TQuoteRequirement_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TQuoteRequirement" ADD CONSTRAINT "FK_TQuoteRequirement_TQuoteCoverage" FOREIGN KEY ("IdeQuoteCoverage") REFERENCES ars_platform."TQuoteCoverage"("IdeQuoteCoverage");
ALTER TABLE ars_platform."TQuoteRequirement" ADD CONSTRAINT "FK_TQuoteRequirement_TQuoteRisk" FOREIGN KEY ("IdeQuoteRisk") REFERENCES ars_platform."TQuoteRisk"("IdeQuoteRisk");
ALTER TABLE ars_platform."TQuoteRequirement" ADD CONSTRAINT "FK_TQuoteRequirement_TQuoteRiskPlan" FOREIGN KEY ("IdeQuoteRiskPlan") REFERENCES ars_platform."TQuoteRiskPlan"("IdeQuoteRiskPlan");


-- ars_platform."TQuoteRisk" foreign keys

ALTER TABLE ars_platform."TQuoteRisk" ADD CONSTRAINT "FK_TQuoteRisk_SRiskProduct" FOREIGN KEY ("IdeRiskProduct") REFERENCES ars_platform."SRiskProduct"("IdeRiskProduct");
ALTER TABLE ars_platform."TQuoteRisk" ADD CONSTRAINT "FK_TQuoteRisk_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TQuoteRisk" ADD CONSTRAINT "FK_TQuoteRisk_TQuote" FOREIGN KEY ("IdeQuote") REFERENCES ars_platform."TQuote"("IdeQuote");


-- ars_platform."TQuoteRiskPlan" foreign keys

ALTER TABLE ars_platform."TQuoteRiskPlan" ADD CONSTRAINT "FK_TQuoteRiskPlan_SPlanProductRisk" FOREIGN KEY ("IdePlanProductRisk") REFERENCES ars_platform."SPlanProductRisk"("IdePlanProductRisk");
ALTER TABLE ars_platform."TQuoteRiskPlan" ADD CONSTRAINT "FK_TQuoteRiskPlan_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TQuoteRiskPlan" ADD CONSTRAINT "FK_TQuoteRiskPlan_TQuoteRisk" FOREIGN KEY ("IdeQuoteRisk") REFERENCES ars_platform."TQuoteRisk"("IdeQuoteRisk");


-- ars_platform."TReceipt" foreign keys

ALTER TABLE ars_platform."TReceipt" ADD CONSTRAINT "FK_TReceipt_SReceiptType" FOREIGN KEY ("IdeReceiptType") REFERENCES ars_platform."SReceiptType"("IdeReceiptType");
ALTER TABLE ars_platform."TReceipt" ADD CONSTRAINT "FK_TReceipt_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TReceipt" ADD CONSTRAINT "FK_TReceipt_TContract" FOREIGN KEY ("IdeContract") REFERENCES ars_platform."TContract"("IdeContract");
ALTER TABLE ars_platform."TReceipt" ADD CONSTRAINT "FK_TReceipt_TContractFile" FOREIGN KEY ("IdeContractFile") REFERENCES ars_platform."TContractFile"("IdeContractFile");
ALTER TABLE ars_platform."TReceipt" ADD CONSTRAINT "FK_TReceipt_TContractOperation" FOREIGN KEY ("IdeContractOperation") REFERENCES ars_platform."TContractOperation"("IdeContractOperation");


-- ars_platform."TReceiptDetail" foreign keys

ALTER TABLE ars_platform."TReceiptDetail" ADD CONSTRAINT "FK_TReceiptDetail_SConcept" FOREIGN KEY ("IdeConcept") REFERENCES ars_platform."SConcept"("IdeConcept");
ALTER TABLE ars_platform."TReceiptDetail" ADD CONSTRAINT "FK_TReceiptDetail_SInsuranceLine" FOREIGN KEY ("IdeInsuranceLine") REFERENCES ars_platform."SInsuranceLine"("IdeInsuranceLine");
ALTER TABLE ars_platform."TReceiptDetail" ADD CONSTRAINT "FK_TReceiptDetail_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TReceiptDetail" ADD CONSTRAINT "FK_TReceiptDetail_TCoverageMovement" FOREIGN KEY ("IdeCoverageMovement") REFERENCES ars_platform."TCoverageMovement"("IdeCoverageMovement");
ALTER TABLE ars_platform."TReceiptDetail" ADD CONSTRAINT "FK_TReceiptDetail_TReceipt" FOREIGN KEY ("IdeReceipt") REFERENCES ars_platform."TReceipt"("IdeReceipt");


-- ars_platform."TRiskCoverage" foreign keys

ALTER TABLE ars_platform."TRiskCoverage" ADD CONSTRAINT "FK_TRiskCoverage_SCoveragePlan" FOREIGN KEY ("IdeCoveragePlan") REFERENCES ars_platform."SCoveragePlan"("IdeCoveragePlan");
ALTER TABLE ars_platform."TRiskCoverage" ADD CONSTRAINT "FK_TRiskCoverage_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TRiskCoverage" ADD CONSTRAINT "FK_TRiskCoverage_TFileRisk" FOREIGN KEY ("IdeFileRisk") REFERENCES ars_platform."TFileRisk"("IdeFileRisk");


-- ars_platform."TRol" foreign keys

ALTER TABLE ars_platform."TRol" ADD CONSTRAINT "FK_TRol_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");


-- ars_platform."TUser" foreign keys

ALTER TABLE ars_platform."TUser" ADD CONSTRAINT "FK_TUser_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TUser" ADD CONSTRAINT "FK_TUser_TRol" FOREIGN KEY ("IdeRol") REFERENCES ars_platform."TRol"("IdeRol");


-- ars_platform."TUserCredential" foreign keys

ALTER TABLE ars_platform."TUserCredential" ADD CONSTRAINT "FK_TUserCredential_SState" FOREIGN KEY ("IdeState") REFERENCES ars_platform."SState"("IdeState");
ALTER TABLE ars_platform."TUserCredential" ADD CONSTRAINT "FK_TUserCredential_TUser" FOREIGN KEY ("IdeUser") REFERENCES ars_platform."TUser"("IdeUser");
