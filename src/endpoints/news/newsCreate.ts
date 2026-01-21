import { D1CreateEndpoint } from "chanfana";
import { HandleArgs } from "../../types";
import { NewsModel } from "./base";

export class NewsCreate extends D1CreateEndpoint<HandleArgs> {
	_meta = {
		model: NewsModel,
		fields: NewsModel.schema.pick({
			pub_date:true,
			title:true,
			url:true,
		}),
	};
}
