import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("TB_MEMBER_DEVICE_MANAGE")
export class MemberDeviceManage {
  @PrimaryGeneratedColumn({ name: "device_idx" })
  device_idx!: number;

  @Column({ name: "member_idx" })
  memberIdx!: number;

  @Column({ name: "station_name" })
  station_name!: string;
}
