import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { DeviceModel } from "./DeviceModel";

@Entity("TB_DEVICE")
export class Device {
  @PrimaryGeneratedColumn({ name: "idx" })
  idx!: number;

  @Column({ type: "varchar", length: 50, unique: true })
  serial_num!: string;

  @OneToOne(() => DeviceModel, (deviceModel) => deviceModel.device)
  device_model!: DeviceModel;
}
