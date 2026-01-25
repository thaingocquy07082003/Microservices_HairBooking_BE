export enum Role {
  Customer = 'customer',
  Receptionist = 'staff', // Nhân viên tại quầy
  HairStylist = 'stylist', // Thợ cắt tóc
  Manager = 'admin', // Quản lý tiệm
  Admin = 'admin',
  SuperAdmin = 'admin',
}
export const RoleList = [
  Role.Customer,
  Role.Receptionist,
  Role.HairStylist,
  Role.Manager,
  Role.Admin,
  Role.SuperAdmin,
];
