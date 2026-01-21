import { D1ListEndpoint } from "chanfana";
import { HandleArgs } from "../../types";
import { NewsModel } from "./base";

export class NewsList extends D1ListEndpoint<HandleArgs> {
	_meta = {
		model: NewsModel,
	};
	searchFields = ["title"];
	defaultOrderBy = "id DESC";
}
