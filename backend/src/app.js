const express = require('express');
const helmet = require('helmet');
const { requestId } = require('./middleware/requestId');
const { errorHandler } = require('./middleware/errorHandler');
const { createApiRouter } = require('./routes');
const { POLICY } = require('./config/policy');
const { createCors } = require('./config/cors');
const { createCsrf } = require('./middleware/csrf');
const { notFound } = require('./middleware/notFound');
const { requestLogger } = require('./config/logger');
const { createReadiness } = require('./services/readiness.service');
const { createModels } = require('./models');
const { createSessionService } = require('./services/session.service');
const { createAuthService } = require('./services/auth.service');
const { createUserService } = require('./services/user.service');
const { createCatalogService } = require('./services/catalog.service');
const { createUploadService } = require('./services/upload.service');
const { createComplaintService } = require('./services/complaint.service');
const { createDashboardService } = require('./services/dashboard.service');
const { unavailable } = require('./utils/AppError');

// Importing or creating the app does not read .env, connect to MongoDB or listen.
function createApp({ config = {}, database, storage, logger, isShuttingDown } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.enable('case sensitive routing');
  app.enable('strict routing');
  app.use(requestId);
  app.locals.logger = logger;
  if (logger) app.use(requestLogger(logger));
  app.use(helmet());
  app.use(createCors(config));
  // Trusted preflights finish in CORS. Prevent Express's automatic OPTIONS
  // response from acknowledging an origin that CORS did not accept.
  app.use((req, res, next) => req.method === 'OPTIONS' ? notFound(req, res, next) : next());
  app.use(createCsrf(config));
  app.use(express.json({ limit: POLICY.jsonBytes, strict: true }));
  let services;
  const getServices = () => {
    if (database?.connection?.readyState !== 1 || !config.JWT_SECRET) throw unavailable();
    if (!services) {
      const context = { connection: database.connection, models: createModels(database.connection), config };
      const sessions = createSessionService(context);
      services = {
        config, sessions, auth: createAuthService({ ...context, sessions }),
        users: createUserService({ ...context, sessions }),
        catalog: createCatalogService(context),
        uploads: createUploadService(context),
        complaints: createComplaintService(context),
        dashboard: createDashboardService(context),
      };
    }
    return services;
  };
  app.use('/api/v1', createApiRouter({ getServices, checkReady: createReadiness({ database, storage, isShuttingDown }) }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
