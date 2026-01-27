export enum Role {
  Customer = 'customer',
  Receptionist = 'staff', // Nhân viên tại quầy
  HairStylist = 'stylist', // Thợ cắt tóc
  Manager = 'manager', // Quản lý tiệm
  Admin = 'admin',
  SuperAdmin = 'superadmin',
}
export const RoleList = [
  Role.Customer,
  Role.Receptionist,
  Role.HairStylist,
  Role.Manager,
  Role.Admin,
  Role.SuperAdmin,
];
