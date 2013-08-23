var sio = require("socket.io").listen(8000);
var uploader = require("./uploader");
var logule = require("logule").init(module);

var fileInfo = {};
sio.set('log level', 1);
sio.on("connection",function(socket){
	socket.on('initUpload',function(data){
		data = JSON.parse(data);
		var fileUploader = new uploader(".");
		fileInfo[data.actionId] = fileUploader;
		fileUploader.init(data.params,function(){
			var ret = {handler:"uploadFile",status:this.status,uploadFileName:this.uploadName,pageIndex:this.pageIndex};
			logule.info("setup to upload file "+this.fileName);
			socket.emit("message",JSON.stringify({actionId:data.actionId,params:ret}));
		});
	});
		
	socket.on("uploadFile",function(data){
		data = JSON.parse(data);
		var fileUploader = fileInfo[data.actionId];
		fileUploader.upload(data.params,function(){
			var ret = {status:this.status};
			logule.info("uploading "+this.fileName+" at "+this.pageIndex+"th");
			socket.emit("message",JSON.stringify({actionId:data.actionId,params:ret}));
		});
	});

	socket.on("stopUpload",function(data){
		var fileUploader = fileInfo[data.actionId];
		fileUploader.stop(null);
	})

	socket.on("disconnect",function(){
		for(var fid in fileInfo){
			fileInfo[fid].pause();
		}
	})
});

