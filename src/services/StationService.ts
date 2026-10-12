import { AppDataSource } from "../../config/database";
import { Device } from "../entities/Device";
import { Between } from "typeorm";
import { MemberDeviceManage } from "../entities/MemberDeviceManage";
import { Member } from "../entities/Member";
import { MemberDeviceControlManage } from "../entities/MemberDeviceControlManage";
import { DeviceModel } from "../entities/DeviceModel";

interface DeviceProps {
  idx: number;
  station_name: string;
  serial_num: string;
  device_model: string;
}

export class StationService {
  private deviceRepository = AppDataSource.getRepository(Device);
  private memberRepository = AppDataSource.getRepository(Member);
  private memberDeviceManageRepository =
    AppDataSource.getRepository(MemberDeviceManage);
  private memberDeviceControlManageRepository = AppDataSource.getRepository(
    MemberDeviceControlManage
  );

  async getDeviceIdxList(memberIdx: number): Promise<[DeviceProps[]]> {
    const [device] = await Promise.all([
      this.deviceRepository
        .createQueryBuilder("device")
        .innerJoin(
          DeviceModel,
          "deviceModel",
          "device.device_model_idx = deviceModel.idx"
        )
        .where((qb) => {
          const subQuery = qb
            .subQuery()
            .select("mdm.device_idx")
            .from(MemberDeviceManage, "mdm")
            .where("mdm.member_idx = :memberIdx", { memberIdx: memberIdx })
            .getQuery();

          return "device.idx IN " + subQuery;
        })
        //.andWhere("device.device_type_idx = 1")
        .select([
          "device.idx AS idx",
          `(SELECT mdm.station_name FROM TB_MEMBER_DEVICE_MANAGE mdm WHERE mdm.device_idx = device.idx LIMIT 1) AS station_name`,
          "device.serial_num AS serial_num",
          "deviceModel.device_model AS device_model",
        ])
        .orderBy("device.idx", "ASC")
        .getRawMany(),
    ]);

    return [device];
  }

  async getVentDeviceIdxList(iaqIdx: number): Promise<DeviceProps[]> {
    const device = await this.deviceRepository
      .createQueryBuilder("device")
      .innerJoin(
        DeviceModel,
        "deviceModel",
        "device.device_model_idx = deviceModel.idx"
      )
      .where((qb) => {
        const subQuery = qb
          .subQuery()
          .select("mdcm.vent_device_idx")
          .from(MemberDeviceControlManage, "mdcm")
          .where("mdcm.iaq_device_idx = :iaqIdx", { iaqIdx })
          .getQuery();

        return "device.idx IN " + subQuery;
      })
      .select([
        "device.idx AS idx",
        "device.serial_num AS serial_num",
        "deviceModel.device_model AS device_model",
        `(SELECT mdm.station_name FROM TB_MEMBER_DEVICE_MANAGE mdm WHERE mdm.device_idx = device.idx LIMIT 1) AS station_name`,
      ])
      .getRawMany();

    return device;
  }
}
