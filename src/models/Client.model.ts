import prisma from '../config/database';

export const ClientModel = {
    findAll: () => prisma.client.findMany(),
    findById: (id: number) => prisma.client.findUnique({ where: { id } }),
    create: (data: any) => prisma.client.create({ data }),
    update: (id: number, data: any) => prisma.client.update({ where: { id }, data }),
    delete: (id: number) => prisma.client.delete({ where: { id } }),
};

export default ClientModel;
