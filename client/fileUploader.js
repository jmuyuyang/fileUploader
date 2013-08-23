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

function FileInfo(file, pagesize) {
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
	this.pause = false;
    if (Math.floor(this.Size % this.PageSize) > 0) {
        this.Pages = Math.floor((this.Size / this.PageSize)) + 1;
    }else {
        this.Pages = Math.floor(this.Size / this.PageSize);
    }
}

FileInfo.prototype.fileId = function(){
	var filestr = this.FileName+"_"+this.Size+"_"+this.File.lastModifiedDate.getTime();
	return hex_md5(filestr);
}

FileInfo.prototype.reset = function () {
    this.PageIndex = 0;
    this.UploadBytes = 0;
}

FileInfo.prototype.toBase64String = function () {
    var binary = ''
    var bytes = new Uint8Array(this.DataBuffer)
    var len = bytes.byteLength;

    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary);
}

FileInfo.prototype.packMsg = function(data){
	var obj = new Object();
	obj.actionId = this.actionId;
	obj.params = data;
	return obj
}

FileInfo.prototype.onLoadData = function (evt) {
    var obj = evt.target["tag"];
    if (evt.target.readyState == FileReader.DONE) {
        obj.DataBuffer = evt.target.result;
		obj.emit('uploadData');
    }
    else {
		obj.emit('uploadError',evt.target.error);
    }
}

FileInfo.prototype.load = function () {
    if (this.filereader == null || this.filereader == undefined)
        this.filereader = new FileReader();
    var reader = this.filereader;
    reader["tag"] = this;
    reader.onloadend = this.onLoadData;
    var count = this.Size - this.PageIndex * this.PageSize;
    if (count > this.PageSize)
       	count = this.PageSize;
   	this.UploadBytes += count;
	var blob = this.File.slice(this.PageIndex * this.PageSize, this.PageIndex * this.PageSize + count,this.File.type);
   	reader.readAsArrayBuffer(blob);
};

FileInfo.prototype.onUploadData = function () {
	var file = this;
    var socket = file._socket;
	if(!file._uploadHandler) return;
	var data = file.packMsg({pageIndex: file.PageIndex + 1, fileData: file.toBase64String()});
    socket.send(file._uploadHandler,data,function (result) {
        if (result.status == "onProgress") {
            file.PageIndex++;
			file.emit("uploadProgress");
            if (file.PageIndex < file.Pages) {
                file.start();
            }
            if(file.pause) this.sync();
        }else if(result.status == "Done"){
			file.emit('uploadDone');
		}else {
			file.emit('uploadError',data.status);
		}
    });
}

FileInfo.prototype.upload = function (socket, handler) {
    var fi = this;
	fi._socket = socket;
	var data = fi.packMsg({hash:fi.actionId,fileName:fi.FileName,fileSize:fi.Size,filePages:fi.Pages,pageSize:fi.PageSize});
	socket.send(handler,data,function(result){
		if(result.status == "error"){
			fi.emit('uploadError',result.status);
		}else{
			fi._uploadHandler = result.handler;
			fi._uploadFileName = result.uploadFileName;
			if(result.status == "onProgress"){
				if(result.pageIndex > 0) fi.PageIndex = result.pageIndex;
			}
			fi.on('uploadData',fi.onUploadData);
			fi.start();
		}
	});
}

FileInfo.prototype.start = function(handler){
	if(handler) this._uploadHandler = handler;
	if(!this.pause){
		this.load();
	}
}

FileInfo.prototype.pause = function(handler){
	if(!this.pause){
		this.pause = true;
	}
}

FileInfo.prototype.on = function(name,callback){
	var events = this._events[name] || (this._events[name] = []);
	events.push(callback);
	return this;
}

FileInfo.prototype.sync = function(){
}

FileInfo.prototype.emit = function(name){
	var args = Array.prototype.slice.call(arguments, 1);
	if(events = this._events[name]){
		for(var idx in events){
			events[idx].apply(this,args);
		}
	}
	return this;
}

