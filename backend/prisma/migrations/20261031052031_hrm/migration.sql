-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FullTime', 'PartTime', 'Contract', 'Intern');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('Active', 'Probation', 'Exited');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('Present', 'HalfDay', 'Absent', 'Leave');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('Annual', 'Sick', 'Casual', 'Unpaid', 'Other');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Cancelled');

-- CreateEnum
CREATE TYPE "EmployeeDocumentKind" AS ENUM ('Contract', 'NationalId', 'Passport', 'Tax', 'Certificate', 'Other');

-- DropIndex
DROP INDEX "Order_deliveryHubId_idx";

-- AlterTable
ALTER TABLE "AccountStatusEvent" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Address" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "AfterSalesRequest" ALTER COLUMN "requestedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "AuthRecoveryRequest" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Brand" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Campaign" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CareerApplication" ALTER COLUMN "consentAcceptedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CareerJob" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CarouselSlide" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "ChatConversation" ALTER COLUMN "lastMessageAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "ChatMessage" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CodCollection" ALTER COLUMN "collectedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "CodSettlement" ALTER COLUMN "receivedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "ContactVerificationOtp" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DeliveryAttempt" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DeliveryCompany" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DeliveryProof" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DeliveryZone" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "DispatchManifest" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Feedback" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "InboxMessage" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "InventoryAdjustment" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "License" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "LoginChallenge" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "OrderEvent" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "PasswordResetChallenge" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "PaymentAttempt" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "PhoneOtp" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "PickList" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "PickListLine" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Promotion" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Receipt" ALTER COLUMN "receivedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Referral" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "RefundRecord" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Rider" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "RiderReview" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Shipment" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "StockNotification" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "StockTransfer" ALTER COLUMN "requestedAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "StoreSettings" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "SupportTicket" ALTER COLUMN "lastActivityAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "SupportTicketNote" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Wallet" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "WalletTransaction" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Warehouse" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Wishlist" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "designation" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FullTime',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'Active',
    "joinDate" TIMESTAMP(3) NOT NULL,
    "probationEndDate" TIMESTAMP(3),
    "exitDate" TIMESTAMP(3),
    "monthlySalaryCents" INTEGER,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "workedMinutes" INTEGER,
    "note" TEXT,
    "markedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'Pending',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "note" TEXT,
    "createdByById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "baseSalaryCents" INTEGER NOT NULL,
    "allowancesCents" INTEGER NOT NULL DEFAULT 0,
    "deductionsCents" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL,
    "note" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "rating" INTEGER NOT NULL,
    "summary" TEXT,
    "strengths" TEXT,
    "improvements" TEXT,
    "goals" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "EmployeeDocumentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "bytes" BYTEA,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_applicationId_key" ON "Employee"("applicationId");

-- CreateIndex
CREATE INDEX "Employee_status_department_idx" ON "Employee"("status", "department");

-- CreateIndex
CREATE INDEX "Employee_joinDate_idx" ON "Employee"("joinDate");

-- CreateIndex
CREATE INDEX "AttendanceRecord_date_idx" ON "AttendanceRecord"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_date_key" ON "AttendanceRecord"("employeeId", "date");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_startDate_idx" ON "LeaveRequest"("status", "startDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_startDate_idx" ON "LeaveRequest"("employeeId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_month_key" ON "PayrollRun"("month");

-- CreateIndex
CREATE INDEX "PayrollRun_month_idx" ON "PayrollRun"("month");

-- CreateIndex
CREATE INDEX "Payslip_employeeId_idx" ON "Payslip"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_runId_employeeId_key" ON "Payslip"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "PerformanceReview_employeeId_periodStart_idx" ON "PerformanceReview"("employeeId", "periodStart");

-- CreateIndex
CREATE INDEX "EmployeeDocument_employeeId_kind_idx" ON "EmployeeDocument"("employeeId", "kind");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CareerApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_createdByById_fkey" FOREIGN KEY ("createdByById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
