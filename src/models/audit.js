import Sequelize from 'sequelize';

export default (database) => {
  const Audit = database.define('audit', {
    user: { type: Sequelize.STRING, allowNull: false },
    organizationId: { type: Sequelize.INTEGER, allowNull: false },
    accessed: { type: Sequelize.DATE, allowNull: false },
    from: { type: Sequelize.DATE, allowNull: false },
    to: { type: Sequelize.DATE, allowNull: false },
    sessionId: { type: Sequelize.STRING, allowNull: false },
  }, {
    timestamps: false,
    freezeTableName: true,
  });

  return { Audit };
};
