import prisma from '../config/database';

export const UserModel = {
    findAll: () => prisma.user.findMany(),
    findById: (id: number) => prisma.user.findUnique({ where: { id } }),
    findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),
    create: (data: any) => prisma.user.create({ data }),
};

export default UserModel;
