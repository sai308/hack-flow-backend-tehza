import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { AppError } from '../errors/AppError';
import { ZodError } from 'zod';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: Error, request: FastifyRequest, reply: FastifyReply): void => {
      // Zod validation errors
      if (error instanceof ZodError) {
        void reply.status(422).send({
          statusCode: 422,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: error.flatten().fieldErrors,
        });
        return;
      }

      // Operational errors (AppError subclasses)
      if (error instanceof AppError && error.isOperational) {
        void reply.status(error.statusCode).send({
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
        });
        return;
      }

      // Fastify's own 4xx errors (e.g. body parse failures)
      if ('statusCode' in error && typeof (error as { statusCode: number }).statusCode === 'number') {
        const statusCode = (error as { statusCode: number }).statusCode;
        if (statusCode < 500) {
          void reply.status(statusCode).send({
            statusCode,
            code: 'BAD_REQUEST',
            message: error.message,
          });
          return;
        }
      }

      // Unknown / programming errors — log and return 500
      request.log.error({ err: error }, 'Unhandled error');
      void reply.status(500).send({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      });
    },
  );
}
