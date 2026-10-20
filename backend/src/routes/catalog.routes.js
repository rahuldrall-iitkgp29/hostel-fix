const { Router } = require('express');
const { createCatalogController } = require('../controllers/catalog.controller');
const { validateQuery } = require('../middleware/validateQuery');
const { validateParams } = require('../middleware/validateParams');
const { noQuery } = require('../validators/common.validators');
const { hostelListQuery, hostelBlocksParams, roomsQuery } = require('../validators/catalog.validators');

function createCatalogRouter(options) {
  const router = Router({ caseSensitive: true, strict: true });
  const controller = createCatalogController(options.getServices);

  router.get('/hostels', options.limiters.public, validateQuery(hostelListQuery), controller.listHostels);
  router.get('/hostels/:hostelId/blocks', options.limiters.public, validateParams(hostelBlocksParams), noQuery, controller.getHostelBlocks);
  router.get('/rooms', options.limiters.public, validateQuery(roomsQuery), controller.listRooms);

  return router;
}

module.exports = { createCatalogRouter };
