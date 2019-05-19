import Sequelize from 'sequelize';
import SequelizeMysqlTS from 'sequelize-mysql-timestamp';

export default (database) => {
  const TS_DATATYPE = database.options.dialect === 'mysql'
    ? SequelizeMysqlTS(database)
    : Sequelize.DATE;
  const Recording = database.define('recording', {
    timestamp: TS_DATATYPE,
    deleteAfter: TS_DATATYPE,
    duration: Sequelize.INTEGER,
    senderId: Sequelize.STRING(128),
    senderName: Sequelize.STRING(128),
    deviceType: Sequelize.STRING(32),
    recordingType: Sequelize.STRING(32),
    sessionId: Sequelize.STRING(128),
    sessionName: Sequelize.STRING(128),
    groupId: Sequelize.INTEGER,
    organizationId: Sequelize.INTEGER,
    path: Sequelize.STRING(256),
  }, {
    timestamps: false,
    freezeTableName: true,
  });

  return { Recording };
};
