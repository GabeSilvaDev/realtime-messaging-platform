jest.mock('sequelize', () => {
  const actual = jest.requireActual('sequelize');
  return {
    ...actual,
    Model: class MockModel {
      static init = jest.fn();
      static findOne = jest.fn();
      static findByPk = jest.fn();
      static findAll = jest.fn();
      static create = jest.fn();
      static update = jest.fn();
      static destroy = jest.fn();
    },
  };
});

describe('shared/database/models index', () => {
  it('deve exportar o model User', () => {
    const { User } = require('@/shared/database/models');
    expect(User).toBeDefined();
    expect(typeof User).toBe('function');
  });
});
