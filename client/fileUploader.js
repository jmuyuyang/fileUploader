var JSONSocket = function(server,port){
	this.disposed = false;
	this.actionID = 0;
	this.callbacks = {};
	this.socketIO = null;
	this.dsn = server+":"+port;
}

JSONSocket.prototype.connect = function(){
	var sio = this;
	sio.socketIO = io.connect(this.dsn);
	sio.socketIO.on('connect',function(){
		sio.onConnect();
	});
	sio.socketIO.on('disconnect',function(){
		sio.disConnect();
	});
	sio.socketIO.on('message',function(data){
		sio.onReceive(data);	
	});
}

JSONSocket.prototype.onConnect = function(){
	console.log("connecting");
}

JSONSocket.prototype.disConnect = function(){
	this.disposed = true;
}

JSONSocket.prototype.onReceive = function(data){
	var obj = JSON.parse(data);
	var actionId = obj.actionId;
	var callback = this.callbacks[actionId];
	if(callback != null){
		callback(obj.params);
	}
}

JSONSocket.prototype.send = function(handler,data,callback){
	var actionId = data.actionId;
	if(callback != null){
		this.callbacks[actionId] = callback;
	}
	//if(!this.disposed) this.connect();
	this.socketIO.emit(handler,JSON.stringify(data));
}

function fileUploader(file, pagesize) {
	this._events = {};
	this._socket = null;
	this._uploadHandler = null;
	this._uploadFileName = null;

    this.Size = file.size;
    this.File = file;
    this.FileName = file.name;
    this.PageSize = pagesize;
    this.PageIndex = 0;
    this.DataBuffer = null;
    this.UploadBytes = 0;
	this.actionId = this.fileId();
	this.pause = true;
    if (Math.floor(this.Size % this.PageSize) > 0) {
        this.Pages = Math.floor((this.Size / this.PageSize)) + 1;
    }else {
        this.Pages = Math.floor(this.Size / this.PageSize);
    }
}

fileUploader.prototype.fileId = function(){
	var filestr = this.FileName+"_"+this.Size+"_"+this.File.lastModifiedDate.getTime();
	return hex_md5(filestr);
}

fileUploader.prototype.encodeBuffer = function () {
    var binary = ''
    var bytes = new Uint8Array(this.DataBuffer)
    var len = bytes.byteLength;

    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary);
}

fileUploader.prototype.packMsg = function(data){
	var obj = new Object();
	obj.actionId = this.actionId;
	obj.params = data;
	return obj
}

fileUploader.prototype.load = function () {
    if (this.filereader == null || this.filereader == undefined)
        this.filereader = new FileReader();
    var reader = this.filereader;
    reader["tag"] = this;
    reader.onloadend = this.loadFileData;
    var count = this.Size - this.PageIndex * this.PageSize;
    if (count > this.PageSize) count = this.PageSize;
   	this.UploadBytes += count;
	var blob = this.File.slice(this.PageIndex * this.PageSize, this.PageIndex * this.PageSize + count,this.File.type);
   	reader.readAsArrayBuffer(blob);
};

fileUploader.prototype.loadFileData = function (evt) {
    var obj = evt.target["tag"];
    if (evt.target.readyState == FileReader.DONE) {
        obj.DataBuffer = evt.target.result;
		obj.emit('fileData');
    }else {
		obj.emit('error',evt.target.error);
    }
}

fileUploader.prototype.uploadFileData = function () {
	var file = this;
    var socket = file._socket;
	if(!file._uploadHandler) return;
	var data = file.packMsg({pageIndex: file.PageIndex + 1, fileData: file.encodeBuffer()});
    socket.send(file._uploadHandler,data,function (result) {
    	switch(result.status){
    		case "progress":{
    			file.PageIndex++;
    			if(file.PageIndex < file.Pages){
    				file.emit("progress");
    				if(file.pause){
    					file.sync();
    				}else{
    					file.load();
    				}
    				break;
    			}
    		}
    		case "done":{
    			file.emit("success");
    			break;
    		}
    		case "error":{
    			file.emit("error");
    			break;
    		}
    	}
    });
}

fileUploader.prototype.upload = function (handler) {
    var fi = this;
	var data = fi.packMsg({hash:fi.actionId,fileName:fi.FileName,fileSize:fi.Size,filePages:fi.Pages,pageSize:fi.PageSize});
	fi._socket.send(handler,data,function(result){
		if(result.status == "error"){
			fi.emit('error',result.status);
		}else{
			fi._uploadHandler = result.handler;
			fi._uploadFileName = result.uploadFileName;
			if(result.status == "progress"){
				if(result.pageIndex > 0) fi.PageIndex = result.pageIndex;
			}
			fi.on('fileData',fi.uploadFileData);
			fi.load();
		}
	});
}

fileUploader.prototype.start = function(socket,handler){
	this._socket = socket;
	if(this.pause){
		this.upload(handler);
		this.pause = false;
	}
}

fileUploader.prototype.stop = function(handler){
	if(!this.pause){
		this._stophandler = handler;
		this.pause = true;
	}
}

fileUploader.prototype.on = function(name,callback){
	var events = this._events[name] || (this._events[name] = []);
	events.push(callback);
	return this;
}

fileUploader.prototype.sync = function(){
	var fi = this;
	fi._socket.send(fi._stophandler,fi.packMsg({}),function(result){
		fi.emit("pause",result);
	});
}

fileUploader.prototype.emit = function(name){
	var args = Array.prototype.slice.call(arguments, 1);
	if(events = this._events[name]){
		for(var idx in events){
			events[idx].apply(this,args);
		}
	}
	return this;
}

