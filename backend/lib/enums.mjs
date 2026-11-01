// Public application values use PascalCase. Prisma maps legacy database encodings.
export {
  OrderStatus as OrderStatuses,
  OrderEventType as OrderEventTypes,
  ReviewStatus as ReviewStatuses,
} from "../generated/prisma/enums.ts";
export {
  CareerJobStatus as CareerJobStatuses,
  CareerEmploymentType as CareerEmploymentTypes,
  CareerWorkplaceMode as CareerWorkplaceModes,
  CareerApplicationStatus as CareerApplicationStatuses,
} from "../generated/prisma/enums.ts";
export { ChatConversationStatus as ChatConversationStatuses } from "../generated/prisma/enums.ts";
export {
  SupportTicketStatus as SupportTicketStatuses,
  SupportTicketPriority as SupportTicketPriorities,
  SupportTicketCategory as SupportTicketCategories,
  SupportTicketSource as SupportTicketSources,
} from "../generated/prisma/enums.ts";
import { Role as Roles } from "../generated/prisma/enums.ts";
export { Roles };
export { PaymentAttemptStatus as PaymentAttemptStatuses } from "../generated/prisma/enums.ts";
export { OrderCurrencySource as OrderCurrencySources } from "../generated/prisma/enums.ts";
export { OrderSource as OrderSources } from "../generated/prisma/enums.ts";
export {
  AfterSalesKind as AfterSalesKinds,
  AfterSalesStatus as AfterSalesStatuses,
  ReturnDisposition as ReturnDispositions,
  RefundTender as RefundTenders,
  RefundStatus as RefundStatuses,
} from "../generated/prisma/enums.ts";
export { CodSettlementMethod as CodSettlementMethods } from "../generated/prisma/enums.ts";
export { InventoryAdjustmentReason as InventoryAdjustmentReasons } from "../generated/prisma/enums.ts";
export {
  EmploymentType as EmploymentTypes,
  EmployeeStatus as EmployeeStatuses,
  AttendanceStatus as AttendanceStatuses,
  LeaveType as LeaveTypes,
  LeaveStatus as LeaveStatuses,
  EmployeeDocumentKind as EmployeeDocumentKinds,
} from "../generated/prisma/enums.ts";
export {
  PaymentMethod as PaymentMethods,
  WalletTxType as WalletTransactionTypes,
  AddressType as AddressTypes,
  InboxCategory as InboxCategories,
} from "../generated/prisma/enums.ts";
export {
  PromotionStatus as PromotionStatuses,
  PromotionAudience as PromotionAudiences,
} from "../generated/prisma/enums.ts";
export const EntityStatuses = Object.freeze({ Active: "Active", Inactive: "Inactive" });
export const AccountStatusTargets = Object.freeze({ User: "User", Rider: "Rider" });
export const Genders = Object.freeze({ male: "MALE", female: "FEMALE", other: "OTHER" });
export const DeliveryRelationships = Object.freeze({
  customer: "CUSTOMER",
  family: "FAMILY",
  reception: "RECEPTION",
  other: "OTHER",
});
export const DeliveryAttemptReasons = Object.freeze({
  noAnswer: "NO_ANSWER",
  unavailable: "UNAVAILABLE",
  addressIssue: "ADDRESS_ISSUE",
  refused: "REFUSED",
  rescheduled: "RESCHEDULED",
  other: "OTHER",
});
// Only raw SQL needs the legacy database encoding; ORM queries use OrderStatuses.
export const OrderDatabaseStatuses = Object.freeze({
  Pending: "PENDING",
  Paid: "PAID",
  Processing: "PROCESSING",
  Confirmed: "CONFIRMED",
  Packing: "PACKING",
  Packed: "PACKED",
  Shipped: "SHIPPED",
  ReturningToOrigin: "RETURNING_TO_ORIGIN",
  Delivered: "DELIVERED",
  Cancelled: "CANCELLED",
});

// Compatibility for signed sessions issued before the database role-name migrations.
const legacyRoleNames = Object.freeze({
  CUSTOMER: Roles.Customer,
  ADMIN: Roles.Admin,
  RIDER: Roles.Rider,
  // Sessions signed before the department-style role rename keep resolving.
  CustomerService: Roles.Support,
  WarehouseKeeper: Roles.Warehouse,
  SalesRep: Roles.Sales,
});
export function normalizeRole(role) {
  if (typeof role !== "string") return null;
  const current = Object.values(Roles).find((value) => value === role);
  if (current) return current;
  return Object.hasOwn(legacyRoleNames, role) ? legacyRoleNames[role] : null;
}
