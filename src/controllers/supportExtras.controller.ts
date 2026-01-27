import { Request, Response } from 'express';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

/**
 * Ticket Departments
 */
export const getDepartments = async (req: Request, res: Response) => {
    const departments = await prisma.ticketDepartment.findMany();
    res.status(200).json({ status: 'success', data: { departments } });
};

export const createDepartment = async (req: Request, res: Response) => {
    const department = await prisma.ticketDepartment.create({ data: req.body });
    res.status(201).json({ status: 'success', data: { department } });
};

export const updateDepartment = async (req: Request, res: Response) => {
    const { id } = req.params;
    const department = await prisma.ticketDepartment.update({
        where: { id: parseInt(id as string) },
        data: req.body
    });
    res.status(200).json({ status: 'success', data: { department } });
};

export const deleteDepartment = async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.ticketDepartment.delete({
        where: { id: parseInt(id as string) }
    });
    res.status(204).json({ status: 'success', data: null });
};

/**
 * Predefined Replies
 */
export const getPredefinedReplies = async (req: Request, res: Response) => {
    const replies = await prisma.predefinedReply.findMany();
    res.status(200).json({ status: 'success', data: { replies } });
};

export const createPredefinedReply = async (req: Request, res: Response) => {
    const reply = await prisma.predefinedReply.create({ data: req.body });
    res.status(201).json({ status: 'success', data: { reply } });
};

export const updatePredefinedReply = async (req: Request, res: Response) => {
    const { id } = req.params;
    const reply = await prisma.predefinedReply.update({
        where: { id: parseInt(id as string) },
        data: req.body
    });
    res.status(200).json({ status: 'success', data: { reply } });
};

export const deletePredefinedReply = async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.predefinedReply.delete({
        where: { id: parseInt(id as string) }
    });
    res.status(204).json({ status: 'success', data: null });
};

/**
 * Network Issues
 */
export const getNetworkIssues = async (req: Request, res: Response) => {
    const issues = await prisma.networkIssue.findMany({
        orderBy: { startDate: 'desc' }
    });
    res.status(200).json({ status: 'success', data: { issues } });
};

export const createNetworkIssue = async (req: Request, res: Response) => {
    const issue = await prisma.networkIssue.create({ data: req.body });
    res.status(201).json({ status: 'success', data: { issue } });
};

export const updateNetworkIssue = async (req: Request, res: Response) => {
    const { id } = req.params;
    const issue = await prisma.networkIssue.update({
        where: { id: parseInt(id as string) },
        data: req.body
    });
    res.status(200).json({ status: 'success', data: { issue } });
};

export const deleteNetworkIssue = async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.networkIssue.delete({
        where: { id: parseInt(id as string) }
    });
    res.status(204).json({ status: 'success', data: null });
};
