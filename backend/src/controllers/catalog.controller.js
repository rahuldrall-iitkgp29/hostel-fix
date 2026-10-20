const { sendData } = require('../utils/response');

function createCatalogController(getServices) {
  function paginatedMeta(result) {
    const page = Number(result.page);
    const limit = Number(result.limit);
    const total = Number(result.total);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      totalPages,
    };
  }

  return {
    listHostels: async (req, res) => {
      const services = getServices();
      const result = await services.catalog.listHostels(req.query);
      return sendData(req, res, result.data, { meta: paginatedMeta(result) });
    },

    getHostelBlocks: async (req, res) => {
      const services = getServices();
      const result = await services.catalog.getHostelBlocks(req.params.hostelId);
      return sendData(req, res, result.data);
    },

    listRooms: async (req, res) => {
      const services = getServices();
      const result = await services.catalog.listRooms(req.query);
      return sendData(req, res, result.data, { meta: paginatedMeta(result) });
    },

    listCategories: async (req, res) => {
      const services = getServices();
      const result = await services.catalog.listCategories(req.query, req.user);
      return sendData(req, res, result.data, { meta: paginatedMeta(result) });
    },

    listAdminStaff: async (req, res) => {
      const services = getServices();
      const result = await services.catalog.listAdminStaff(req.query, req.user);
      return sendData(req, res, result.data, { meta: paginatedMeta(result) });
    },
  };
}

module.exports = { createCatalogController };
