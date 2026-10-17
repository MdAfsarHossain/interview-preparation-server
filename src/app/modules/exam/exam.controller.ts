import httpStatus from "http-status";
import { Request, Response } from "express";
import catchAsync from "../../helpers/catchAsync";
import sendResponse from "../../helpers/sendResponse";
import { ExamService } from "./exam.service";

const startExam = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await ExamService.startExam(userId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Exam started successfully!",
    data: result,
  });
});

const getRunningExam = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { id } = req.params;
  const result = await ExamService.getRunningExam(userId, id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Exam retrieved successfully!",
    data: result,
  });
});

const submitExam = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { id } = req.params;
  const result = await ExamService.submitExam(userId, id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Exam submitted successfully!",
    data: result,
  });
});

const getExamResult = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { id } = req.params;
  const result = await ExamService.getExamResult(userId, id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Exam result retrieved successfully!",
    data: result,
  });
});

const getExamHistory = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await ExamService.getExamHistory(userId, req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Exam history retrieved successfully!",
    meta: result.meta,
    data: result.data,
  });
});

export const ExamController = {
  startExam,
  getRunningExam,
  submitExam,
  getExamResult,
  getExamHistory,
};
