-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('Open', 'InProgress', 'Waiting', 'Resolved', 'Closed');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('Low', 'Normal', 'High', 'Urgent');

-- CreateEnum
CREATE TYPE "SupportTicketCategory" AS ENUM ('OrderStatus', 'Payment', 'Refund', 'Return', 'Delivery', 'Account', 'Product', 'Other');

-- CreateEnum
CREATE TYPE "SupportTicketSource" AS ENUM ('Chat', 'Order', 'Manual');

-- CreateSequence
CREATE SEQUENCE "SupportTicketNumberSeq" AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;

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
ALTER TABLE "Product" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Promotion" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

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
ALTER TABLE "StockNotification" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "StoreSettings" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Wallet" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "WalletTransaction" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Wishlist" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'Open',
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'Normal',
    "category" "SupportTicketCategory" NOT NULL DEFAULT 'Other',
    "source" "SupportTicketSource" NOT NULL DEFAULT 'Manual',
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "conversationId" TEXT,
    "assignedToId" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "escalationNote" TEXT,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketNote" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorRole" "Role" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),

    CONSTRAINT "SupportTicketNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");

-- CreateIndex
CREATE INDEX "SupportTicket_status_lastActivityAt_idx" ON "SupportTicket"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedToId_status_idx" ON "SupportTicket"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_customerId_createdAt_idx" ON "SupportTicket"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_orderId_idx" ON "SupportTicket"("orderId");

-- CreateIndex
CREATE INDEX "SupportTicketNote_ticketId_createdAt_idx" ON "SupportTicketNote"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketNote" ADD CONSTRAINT "SupportTicketNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
