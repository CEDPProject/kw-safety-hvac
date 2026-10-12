import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("TB_MEMBER_DEVICE_CONTROL_MANAGE")
export class MemberDeviceControlManage {
  @PrimaryGeneratedColumn({ name: "iaq_device_idx" })
  iaq_device_idx!: number;

  @Column({ name: "member_idx" })
  memberIdx!: number;

  @Column({ name: "vent_device_idx" })
  ventDeviceIdx!: number;
}
