var fs = require("fs");
var path = require('path');

var uploader = function(tmpDir,uploadDir,syncTimeRate){
	this.tmpDir = tmpDir;
	this.uploadDir = uploadDir;
	if(syncTimeRate && syncTimeRate > 0){
		this.syncTimeRate = syncTimeRate;
	}else{
		this.syncTimeRate = 0;
	}
}

uploader.prototype.init = function(param,callback){
	this.fileName = param.fileName;
	this.fileSize = param.fileSize;
	this.filePages = param.filePages;
	this.pageSize = param.pageSize;
	this.hash = param.hash;
	this.buf_list = [];
	var ext = /\.([^\.]+)$/.exec(this.fileName)
	if(ext){
		this.fileExt = ext[1];
		this.uploadName = this.hash+ext[0];
	}else{
		this.fileExt = null;
		this.uploadName = this.hash;
	}
	this.status = "ready";
	this.readPersistDat(callback);
}

uploader.prototype.upload = function(param,callback){
	this.pageIndex = param.pageIndex;
	this.write(param.fileData,callback);
}

uploader.prototype.pause = function(callback){
	this.destroy();
	this.syncProgress(callback);
}

uploader.prototype.readPersistDat = function(callback){
	var datFile = path.resolve(this.tmpDir,this.uploadName+".dat");
	var uploadFile = path.resolve(this.tmpDir,this.uploadName+".tmp");
	var up = this;
	if(fs.existsSync(uploadFile)){
		fs.exists(datFile,function(exists){
			if(exists){
				fs.readFile(datFile,function(err,data){
					if(err){
						up.status = "error";
					}else{
						var obj = JSON.parse(data);
						up.fileName = obj.fileName;
						up.pageIndex = obj.uploadPages;
						up.status = "progress";
					}
					callback.apply(up);			
				});	
			}else{
				this.openStream(false);
				callback.apply(up);	
			}
		});
	}else{
		callback.apply(up);	
	}
}

uploader.prototype.openStream = function(append){
	var f = path.resolve(this.tempDir,this.uploadName+".tmp");
	if(append){
		this.stream = fs.createWriteStream(f, {flags:"a",mode:0666});
	}else{
		this.stream = fs.createWriteStream(f, {flags:"w",mode:0666});
	}
	if(!this.stream) return false;
	return true;
}

uploader.prototype.write = function(data,callback){
	var buf = new Buffer(data,'base64');
	this.buf_list.push(buf);
	if(this.pageIndex >= this.filePages){
		this.sync();
		this.destroy();
		this.done(callback);
	}else{
		if(this.syncTimeRate > 0){
			if(this.pageIndex % this.syncTimeRate == 0){
				this.sync();
			}
		}else{
			//default per 2 pages sync
			if(this.pageIndex % 2 == 0){
				this.sync();
			}
		}

		if(this.status != "progress"){
			this.status = "progress";
		}
		callback.apply(this);
	}
}

uploader.prototype.done = function(callback){
	var up = this;
	var tmpFile = path.join(this.tmpDir,this.uploadName+".tmp");
	var uploadFile = path.join(this.uploadDir,this.uploadName);
	fs.exists(tmpFile,function(exists){
		if(exists){
			fs.rename(tmpFile,uploadFile,function(err){
				if(err) up.status = "error";
				else{
					up.status = "done";
					up.removeProgress();
					callback.apply(up);
				}
			})
		}
	})
}

uploader.prototype.sync = function(){
	if(!this.stream) this.openStream(true);
	if(this.pageIndex >= this.filePages){
		var lastPageSize = this.fileSize - (this.pageIndex-1)*this.pageSize;
		var uploadBytes = (this.buf_list.length-1) * this.pageSize + lastPageSize;
	}else{
		var uploadBytes = this.buf_list.length * this.pageSize;
	}
	this.stream.write(Buffer.concat(this.buf_list,uploadBytes));
	this.buf_list = [];
}

uploader.prototype.syncProgress = function(callback){
	if(this.pageIndex < this.filePages){
		var f = path.resolve(this.tmpDir,this.uploadName+".dat");
		var data = {hash:this.hash,fileName:this.fileName,uploadBytes:this.pageIndex * this.pageSize,uploadPages:this.pageIndex};
		var up = this;
		fs.writeFile(f,JSON.stringify(data),function(err){
			if(err){
				up.status = "error";
			}else{
				up.status = "pause";
			}	
			if(callback) callback.apply(up,err);
		});
	}
}

/*
uploader.prototype.syncProgress = function(callback){
	if(!this.redisClient) this.redisClient = redis.createClient();
	var up = this;
	this.redisClient.set(this.hash,JSON.stringify({fileName:this.fileName,uploadBytes:this.pageIndex * this.pageSize,uploadPages:this.pageIndex}),function(err,replies){
		if(err){
			up.status = "error";
		}else{
			up.status = "pause";
		}
		if(callback) callback.apply(up,err);
	})
}
*/

uploader.prototype.removeProgress = function(){
	var f = path.resolve(this.tmpdDir,this.uploadName+".dat");
	fs.exists(f,function(exists){
		if(exists){
			fs.unlinkSync(f);
		}
	});
}

uploader.prototype.destroy = function(){
	if(this.buf_list.length > 0){
		this.sync();
	}
	if(this.stream) {
		this.stream.end();
		this.stream = null;
	}
}

module.exports = uploader;